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
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger
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
  /**
   * Garante que o usuário logado só mexa em registros da sua própria empresa.
   * Master tem passe livre.
   */
  private validateOwnership(resource: { companyId: string | null }) {
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    // 1. Se for Master, pode tudo.
    if (isMaster) return;

    // 2. Se o registro pertence a outra empresa (ou não tem empresa e quem tenta não é master)
    if (resource.companyId !== tenantId) {
      this.logger.warn(`⛔ Tentativa de acesso negado. Tenant: ${tenantId} tentou acessar Company: ${resource.companyId}`);
      throw new ForbiddenException('Acesso negado: Você não tem permissão para alterar este registro.');
    }
  }

  // ===========================================================================
  // 📝 ESCRITA (CREATE / UPDATE / DELETE)
  // ===========================================================================

  public async createUser(data: CreateUserDto): Promise<User> {
    // LOG 1: Entrada de dados
    console.log('📦 [Backend Service] Recebido createUser:', JSON.stringify(data));

    const { password, ...rest } = data;
    const hashedPassword = await bcrypt.hash(password, 10);

    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    console.log(`🔒 [Backend Context] IsMaster: ${isMaster}, TenantId (User Logado): ${tenantId}`);

    let targetCompanyId = tenantId;

    if (isMaster) {
        if (data.companyId) {
             console.log(`👉 [Backend Logic] Master definiu companyId explícito: ${data.companyId}`);
             targetCompanyId = data.companyId;
        } else {
             console.warn(`⚠️ [Backend Logic] Master NÃO enviou companyId. Usando o dele mesmo: ${targetCompanyId}`);
        }
    } else {
        console.log(`👤 [Backend Logic] Admin criando usuário. Forçando companyId: ${targetCompanyId}`);
    }
    
    const { companyId: _, ...userDataWithoutCompany } = rest as any;

    const userData: Prisma.UserUncheckedCreateInput = {
      ...userDataWithoutCompany,
      password: hashedPassword,
      status: SimpleStatus.ACTIVE,
      companyId: targetCompanyId, 
    };

    console.log('💾 [Backend Prisma] Tentando salvar com companyId:', userData.companyId);

    try {
      // Create não precisa de validateOwnership pois é um registro novo
      const user = await this.prisma.extended.user.create({ data: userData });
      console.log('✅ [Backend Success] Usuário criado. ID:', user.id, 'CompanyID:', user.companyId);
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

  public async updateUser(data: UpdateUserDto & { id: string }): Promise<User> {
    const { id, password, ...updateFields } = data;
    
    // 1. Busca o usuário atual no banco
    const userToUpdate = await this.findUserById(id); 
    
    // 2. 🔥 Validação de Segurança
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
    // 1. Busca o usuário atual no banco
    const userToDelete = await this.findUserById(userId); 
    
    // 2. 🔥 Validação de Segurança
    this.validateOwnership(userToDelete);

    return await this.prisma.extended.user.delete({
      where: { id: userId },
    });
  }

  // ===========================================================================
  // 🔍 LEITURA
  // ===========================================================================

  public async findUserById(userId: string): Promise<User> {
    const user = await this.prisma.extended.user.findFirst({
      where: { id: userId },
      include: { 
        company: { 
            select: { id: true, name: true } 
        } 
      }
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
      include: { 
        company: { select: { id: true, name: true } } 
      }
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

    // Limpeza de filtros undefined
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
        include: {
          company: {
            select: {
              id: true,
              name: true,
            }
          }
        }
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