/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SimpleStatus, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) { }

  // ===========================================================================
  // 🔒 HELPER DE SEGURANÇA
  // ===========================================================================
  private validateOwnership(resource: { companyId: string | null }) {
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    if (isMaster) return;

    if (resource.companyId !== tenantId) {
      this.logger.warn(`⛔ Tentativa de acesso negado. Tenant: ${tenantId} tentou acessar Company: ${resource.companyId}`);
      throw new ForbiddenException('Acesso negado: Você não tem permissão para alterar este registro.');
    }
  }

  // ===========================================================================
  // 📝 ESCRITA (CREATE / UPDATE / DELETE)
  // ===========================================================================

  public async createUser(data: CreateUserDto): Promise<User> {
    console.log('📦 [Backend Service] Recebido createUser:', JSON.stringify(data));

    const { password, ...rest } = data;
    const hashedPassword = await bcrypt.hash(password, 10);

    // Contexto do Usuário Logado (Quem está criando)
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    console.log(`🔒 [Backend Context] IsMaster: ${isMaster}, TenantId: ${tenantId}`);

    let targetCompanyId = tenantId;
    let targetRole: UserRole; // Variável para definir o cargo do novo usuário

    // --- REGRA DE NEGÓCIO: HIERARQUIA DE CRIAÇÃO ---
    if (isMaster) {
      // 1. MASTER criando
      // Regra: Master cadastra ADMIN
      targetRole = UserRole.ADMIN;

      // Lógica de Empresa do Master
      if (data.companyId) {
        targetCompanyId = data.companyId;
      }
    } else {
      // 2. ADMIN criando
      // Regra: Admin cadastra EMPLOYER (Colaborador)
      targetRole = UserRole.EMPLOYER;

      // Admin sempre cria na própria empresa
      console.log(`👤 [Backend Logic] Admin criando usuário. Forçando Employer.`);
    }

    // Remove campos sensíveis ou que serão sobrescritos do DTO
    const { companyId: _, role: __, ...userDataWithoutCompanyAndRole } = rest as any;

    const userData: Prisma.UserUncheckedCreateInput = {
      ...userDataWithoutCompanyAndRole,
      password: hashedPassword,
      status: SimpleStatus.ACTIVE,
      companyId: targetCompanyId,
      role: targetRole, // 🔥 AQUI APLICAMOS A REGRA FORÇADA
    };

    console.log(`💾 [Backend Prisma] Salvando: Role=${userData.role}, CompanyId=${userData.companyId}`);

    try {
      const user = await this.prisma.extended.user.create({
        data: userData,
        // 🔥 ADICIONE ISTO: Retorna o objeto company junto com o user criado
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      return user;
    } catch (error: any) {
      console.error('❌ [Backend Error]', error);
      if (error.code === 'P2002') {
        throw new ConflictException('Email ou CPF já estão em uso.');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('ID da Empresa inválido.');
      }
      throw new BadRequestException('Erro ao criar usuário.');
    }
  }

  // ... (Resto dos métodos update, remove, findAll permanecem iguais) ...

  public async updateUser(data: UpdateUserDto & { id: string }): Promise<User> {
    const { id, password, ...updateFields } = data;
    const userToUpdate = await this.findUserById(id);
    this.validateOwnership(userToUpdate);

    const updateData: Prisma.UserUpdateInput = { ...updateFields };

    if (password) {
      updateData.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    return await this.prisma.extended.user.update({
      where: { id },
      data: updateData,
    });
  }

  public async removeUser(userId: string): Promise<User> {
    const userToDelete = await this.findUserById(userId);
    this.validateOwnership(userToDelete);

    return await this.prisma.extended.user.delete({
      where: { id: userId },
    });
  }

  public async findUserById(userId: string): Promise<User> {
    const user = await this.prisma.extended.user.findFirst({
      where: { id: userId },
      include: { company: { select: { id: true, name: true } } }
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  public async searchUsers(query: string): Promise<User[]> {
    return this.prisma.extended.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
        status: SimpleStatus.ACTIVE,
      },
      take: 10,
      orderBy: { name: 'asc' },
      include: { company: { select: { id: true, name: true } } }
    });
  }

  public async findAll(
    page: number,
    limit: number,
    filters: { status?: SimpleStatus; role?: UserRole; companyId?: string }
  ): Promise<{ data: User[], total: number }> {
    const skip = (page - 1) * limit;
    const isMaster = this.cls.get<boolean>('isMaster');
    const where: any = { ...filters };

    Object.keys(where).forEach(key => where[key] === undefined && delete where[key]);

    if (isMaster && filters.companyId) {
      where.companyId = filters.companyId;
    } else if (!isMaster) {
      delete where.companyId;
    }

    const [total, data] = await Promise.all([
      this.prisma.extended.user.count({ where }),
      this.prisma.extended.user.findMany({
        skip,
        take: limit,
        where,
        orderBy: { name: 'asc' },
        include: { company: { select: { id: true, name: true } } }
      })
    ]);

    return { data, total };
  }

  public async findUsersByCompany(companyId: string): Promise<User[]> {
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    if (!isMaster && companyId !== tenantId) {
      throw new ForbiddenException('Acesso negado.');
    }

    return this.prisma.extended.user.findMany({
      where: { companyId, status: SimpleStatus.ACTIVE },
      orderBy: { name: 'asc' },
    });
  }
}