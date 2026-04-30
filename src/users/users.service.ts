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

  // users.service.ts - createUser

  // users.service.ts - createUser

  public async createUser(data: CreateUserDto): Promise<User> {
    const { password, ...rest } = data;
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    this.logger.log(`Iniciando criação de usuário: ${rest.email}`);

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    let targetCompanyId = tenantId;
    let targetRole: UserRole = UserRole.EMPLOYER;

    if (isMaster) {
      if (data.role) targetRole = data.role;
      if (data.companyId) targetCompanyId = data.companyId;
    } else {
      targetRole = UserRole.EMPLOYER;
    }

    try {
      const userData: any = {
        name: rest.name,
        email: rest.email,
        password: hashedPassword,
        contact: rest.contact,
        status: rest.status || SimpleStatus.ACTIVE,
        role: targetRole,
        companyId: targetCompanyId,
      };

      if (rest.document !== undefined && rest.document !== '') {
        userData.document = rest.document;
      }

      // 🔥 TRATAR professionalRole (nome do cargo)
      if (rest.professionalRole !== undefined && rest.professionalRole !== '') {
        const roleName = rest.professionalRole;

        // Salva o NOME diretamente no campo professionalRoleName
        userData.professionalRoleName = roleName;
        this.logger.log(
          `📌 Salvando nome do cargo profissional: "${roleName}"`,
        );

        // Opcional: Também tenta buscar o ID para manter o relacionamento
        const companyRole = await this.prisma.companyRole.findFirst({
          where: {
            companyId: targetCompanyId,
            name: {
              equals: roleName,
              mode: 'insensitive',
            },
            status: SimpleStatus.ACTIVE,
          },
        });

        if (companyRole) {
          userData.professionalRoleId = companyRole.id;
          this.logger.log(`✅ Também vinculou ao ID: ${companyRole.id}`);
        }
      }

      // Cargo na empresa (companyRole)
      if (rest.companyRoleId !== undefined && rest.companyRoleId !== '') {
        userData.companyRoleId = rest.companyRoleId;
      }

      this.logger.log(`📦 Criando usuário com dados:`, userData);

      const newUser = await this.db.user.create({
        data: userData,
        include: {
          company: { select: { id: true, name: true } },
          companyRole: { select: { id: true, name: true } },
        },
      });

      this.logger.log(`✅ Usuário criado com sucesso: ${newUser.id}`);

      return newUser;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email ou CPF já cadastrados.');
      }
      this.logger.error(`Erro ao criar usuário: ${error.message}`);
      throw new BadRequestException('Não foi possível processar o cadastro.');
    }
  }

  public async updateUser(data: UpdateUserDto & { id: string }): Promise<User> {
    const {
      id,
      password,
      role,
      professionalRole,
      professionalRoleId,
      companyRoleId,
      ...updateFields
    } = data;
    const isMaster = this.cls.get<boolean>('isMaster');

    this.logger.log(`📝 Atualizando usuário ${id}`);

    const existingUser = await this.findUserById(id);

    const userData: any = {};

    if (updateFields.name !== undefined) userData.name = updateFields.name;
    if (updateFields.email !== undefined) userData.email = updateFields.email;
    if (updateFields.contact !== undefined)
      userData.contact = updateFields.contact;

    // 🔥 TRATAR DOCUMENTO: string vazia se torna null
    if (updateFields.document !== undefined) {
      userData.document =
        updateFields.document === '' || updateFields.document === null
          ? null
          : updateFields.document;
    }

    // 🔥 PRIORIDADE 1: Se veio professionalRoleId (ID direto), usa ele
    if (professionalRoleId !== undefined) {
      userData.professionalRoleId =
        professionalRoleId === '' || professionalRoleId === null
          ? null
          : professionalRoleId;
      this.logger.log(
        `📌 Usando professionalRoleId direto: ${professionalRoleId}`,
      );
    }
    // 🔥 PRIORIDADE 2: Se veio professionalRole (nome), busca o ID
    else if (professionalRole !== undefined) {
      if (professionalRole === '' || professionalRole === null) {
        userData.professionalRoleId = null;
        this.logger.log(`🗑️ Removendo cargo profissional do usuário`);
      } else {
        const companyId = existingUser.companyId;
        this.logger.log(
          `🔍 Buscando cargo pelo nome: "${professionalRole}" para empresa: ${companyId}`,
        );

        let companyRole: { id: string } | null = null;
        if (companyId) {
          companyRole = await this.prisma.companyRole.findFirst({
            where: {
              companyId: companyId,
              name: {
                equals: professionalRole,
                mode: 'insensitive',
              },
              status: SimpleStatus.ACTIVE,
            },
          });
        }

        if (companyRole) {
          userData.professionalRoleId = companyRole.id;
          this.logger.log(
            `✅ Cargo "${professionalRole}" encontrado com ID: ${companyRole.id}`,
          );
        } else {
          this.logger.warn(
            `⚠️ Cargo "${professionalRole}" NÃO encontrado para a empresa ${companyId}`,
          );
          // Opcional: manter o valor anterior ou lançar erro
          // userData.professionalRoleId = null;
        }
      }
    }

    // Cargo na empresa (companyRole)
    if (companyRoleId !== undefined) {
      userData.companyRoleId =
        companyRoleId === '' || companyRoleId === null ? null : companyRoleId;
    }

    // 🔥 Role: apenas MASTER pode alterar
    if (role && isMaster) {
      userData.role = role;
    } else if (role && !isMaster) {
      this.logger.warn(
        `⚠️ Tentativa de alteração de Role bloqueada para o usuário ${id}`,
      );
    }

    // 🔥 Senha: se fornecida, faz hash
    if (password) {
      userData.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    this.logger.log(`📦 Dados finais para atualização:`, userData);

    return await this.db.user.update({
      where: { id },
      data: userData,
    });
  }

  public async removeUser(userId: string): Promise<User> {
    await this.findUserById(userId);
    return await this.db.user.delete({
      where: { id: userId },
    });
  }

  // ===========================================================================
  // 🔍 LEITURA (READ)
  // ===========================================================================

  public async findUserById(userId: string): Promise<User> {
    this.logger.log(`🔍 Buscando usuário por ID: ${userId}`);
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        company: { select: { id: true, name: true } },
        companyRole: {
          select: { id: true, name: true, level: true, description: true },
        },
        // 🔥 Não precisa incluir professionalRole se estamos usando professionalRoleName
      },
    });

    this.logger.log(`📦 Usuário encontrado:`, {
      id: user?.id,
      name: user?.name,
      companyRoleId: user?.companyRoleId,
      companyRole: user?.companyRole,
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
      professionalRole?: string;
    },
  ): Promise<{ data: User[]; total: number }> {
    const skip = (page - 1) * limit;
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    const where: any = { ...filters };

    if (where.professionalRole) {
      where.professionalRole = {
        contains: where.professionalRole,
        mode: 'insensitive',
      };
    }

    Object.keys(where).forEach(
      (key) => where[key] === undefined && delete where[key],
    );

    if (!isMaster) {
      where.companyId = tenantId;
    }

    this.logger.log(`🔍 findAll - where:`, where);

    // 🔥 USAR this.prisma DIRETAMENTE (não this.db) para garantir o include
    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        skip,
        take: limit,
        where,
        orderBy: { name: 'asc' },
        include: {
          company: { select: { id: true, name: true } },
          companyRole: {
            select: {
              id: true,
              name: true,
              level: true,
              description: true,
            },
          },
        },
      }),
    ]);

    this.logger.log(`📦 Total de usuários encontrados: ${data.length}`);

    // 🔥 LOG para verificar se o companyRole veio
    data.forEach((user) => {
      this.logger.log(
        `   - ${user.name}: companyRoleId=${user.companyRoleId}, companyRole=${user.companyRole?.name || 'NULO'}`,
      );
    });

    return { data, total };
  }

  public async findUsersByCompany(companyId: string): Promise<User[]> {
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    if (!isMaster && companyId !== tenantId) {
      throw new ForbiddenException(
        'Acesso negado: Você só pode listar membros da sua própria empresa.',
      );
    }

    return this.db.user.findMany({
      where: { companyId, status: SimpleStatus.ACTIVE },
      orderBy: { name: 'asc' },
      include: {
        companyRole: { select: { id: true, name: true, level: true } },
      },
    });
  }

  // users.service.ts - findByProfessionalRole

  public async findByProfessionalRole(professionalRole: string) {
    this.logger.log(`Buscando usuários com cargo: ${professionalRole}`);

    const tenantId = this.cls.get<string>('tenantId');
    const isMaster = this.cls.get<boolean>('isMaster');

    const where: any = {
      status: SimpleStatus.ACTIVE,
    };

    if (!isMaster) {
      where.companyId = tenantId;
    }

    // 🔥 CORREÇÃO: Buscar pelo nome do cargo no relacionamento professionalRole
    const users = await this.db.user.findMany({
      where: {
        ...where,
        professionalRole: {
          name: {
            contains: professionalRole,
            mode: 'insensitive',
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        professionalRole: {
          select: {
            name: true,
          },
        },
        status: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        companyRole: {
          select: {
            id: true,
            name: true,
            level: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    this.logger.log(
      `Encontrados ${users.length} usuários com o cargo ${professionalRole}`,
    );

    // 🔥 Transformar para manter compatibilidade com o frontend
    return users.map((user) => ({
      ...user,
      professionalRole: user.professionalRole?.name || null,
    }));
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
      include: {
        company: { select: { id: true, name: true } },
        companyRole: { select: { id: true, name: true, level: true } },
      },
    });
  }

  public async getProfessionalRoles() {
    this.logger.log('🔍 Buscando todos os cargos profissionais');

    const tenantId = this.cls.get<string>('tenantId');
    const isMaster = this.cls.get<boolean>('isMaster');

    // Busca cargos únicos dos usuários da empresa
    const users = await this.prisma.user.findMany({
      where: isMaster ? {} : { companyId: tenantId },
      select: {
        professionalRoleId: true,
      },
      distinct: ['professionalRoleId'],
    });

    const roles = users
      .map((u) => u.professionalRoleId)
      .filter((role): role is string => role !== null && role !== '');

    // Ordena alfabeticamente
    roles.sort((a, b) => a.localeCompare(b, 'pt-BR'));

    this.logger.log(
      `✅ Encontrados ${roles.length} cargos únicos: ${roles.join(', ')}`,
    );

    return {
      data: roles.map((role) => ({
        value: role,
        label: role.charAt(0).toUpperCase() + role.slice(1),
      })),
      total: roles.length,
    };
  }
}
