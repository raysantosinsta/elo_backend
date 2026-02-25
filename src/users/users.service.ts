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
/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Atalho para o cliente Prisma estendido com Multi-tenant e Auditoria.
   */
  private get db() {
    return this.prisma.extended;
  }

  // ===========================================================================
  // 📝 ESCRITA (CREATE / UPDATE / DELETE)
  // ===========================================================================

  public async createUser(data: CreateUserDto): Promise<User> {
    const { password, ...rest } = data;
    
    this.logger.log(`Iniciando criação de usuário: ${rest.email}`);

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    let targetCompanyId = tenantId;
    let targetRole: UserRole = UserRole.EMPLOYER;

    // --- REGRA DE NEGÓCIO E HIERARQUIA ---
    // Se for Master, ele cria um ADMIN vinculado a uma empresa específica
    if (isMaster) {
      targetRole = UserRole.ADMIN;
      if (data.companyId) targetCompanyId = data.companyId;
    } 
    // Se for ADMIN (não master), o tenantId já vem do token e o role é EMPLOYER

    try {
      return await this.db.user.create({
        data: {
          name: rest.name,
          email: rest.email,
          password: hashedPassword,
          contact: rest.contact,
          document: rest.document,
          professionalRole: rest.professionalRole,
          status: rest.status || SimpleStatus.ACTIVE,
          role: targetRole,
          companyId: targetCompanyId,
        },
        include: { company: { select: { id: true, name: true } } }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email ou CPF já cadastrados.');
      }
      
      this.logger.error(`Erro ao criar usuário: ${error.message}`);
      throw new BadRequestException('Não foi possível processar o cadastro.');
    }
  }

  public async updateUser(data: UpdateUserDto & { id: string }): Promise<User> {
    const { id, password, role, ...updateFields } = data;
    const isMaster = this.cls.get<boolean>('isMaster');

    // Valida se o usuário existe e se pertence ao tenant (via findUserById)
    await this.findUserById(id);

    const finalData: Prisma.UserUpdateInput = { ...updateFields };
    
    // 🔐 PREVENÇÃO DE ESCALAÇÃO DE PRIVILÉGIO
    // Apenas Master pode alterar o nível de acesso (Role) de um usuário.
    if (role && isMaster) {
      finalData.role = role;
    } else if (role) {
      this.logger.warn(`Tentativa de alteração de Role bloqueada para o usuário ${id}`);
    }

    if (password) {
      finalData.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    return await this.db.user.update({
      where: { id },
      data: finalData,
    });
  }

  public async removeUser(userId: string): Promise<User> {
    // Garante que o usuário logado tem acesso a este ID antes de deletar
    await this.findUserById(userId);

    return await this.db.user.delete({
      where: { id: userId },
    });
  }

  // ===========================================================================
  // 🔍 LEITURA (READ)
  // ===========================================================================

  public async findUserById(userId: string): Promise<User> {
    // O uso de this.db garante a injeção automática de WHERE companyId = tenantId
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { company: { select: { id: true, name: true } } }
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado ou acesso negado.');
    }
    return user;
  }

  public async findAll(
    page: number,
    limit: number,
    filters: { 
      status?: SimpleStatus; 
      role?: UserRole; 
      companyId?: string;
      professionalRole?: string; // 🔥 NOVO
    }
  ): Promise<{ data: User[], total: number }> {
    const skip = (page - 1) * limit;
    const isMaster = this.cls.get<boolean>('isMaster');
    
    const where: any = { ...filters };
    
    // 🔥 Tratamento especial para professionalRole (busca parcial)
    if (where.professionalRole) {
      where.professionalRole = {
        contains: where.professionalRole,
        mode: 'insensitive',
      };
    }
    
    // Limpeza de filtros vazios
    Object.keys(where).forEach(key => where[key] === undefined && delete where[key]);

    // Proteção Multi-tenant: Se não for Master, remove companyId do filtro para usar o tenantId do token
    if (!isMaster) {
      delete where.companyId;
    }

    const [total, data] = await Promise.all([
      this.db.user.count({ where }),
      this.db.user.findMany({
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

    // Validação de acesso manual para reforçar a barreira de segurança
    if (!isMaster && companyId !== tenantId) {
      throw new ForbiddenException('Acesso negado: Você só pode listar membros da sua própria empresa.');
    }

    return this.db.user.findMany({
      where: { companyId, status: SimpleStatus.ACTIVE },
      orderBy: { name: 'asc' },
    });
  }

  // ===========================================================================
  // 🔥 NOVO MÉTODO: Buscar usuários por cargo profissional
  // ===========================================================================
  public async findByProfessionalRole(professionalRole: string) {
    this.logger.log(`Buscando usuários com cargo: ${professionalRole}`);

    const tenantId = this.cls.get<string>('tenantId');
    const isMaster = this.cls.get<boolean>('isMaster');

    const where: any = {
      status: SimpleStatus.ACTIVE,
      professionalRole: {
        contains: professionalRole,
        mode: 'insensitive',
      },
    };

    // Se não for master, filtra pela empresa do token
    if (!isMaster) {
      where.companyId = tenantId;
    }

    const users = await this.db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        professionalRole: true,
        status: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    this.logger.log(`Encontrados ${users.length} usuários com o cargo ${professionalRole}`);
    return users;
  }

  public async searchUsers(query: string): Promise<User[]> {
    return this.db.user.findMany({
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
}