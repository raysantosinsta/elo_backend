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
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly mailService: MailService, // 🔥 INJETADO
  ) {}

  /**
   * Atalho para o cliente Prisma estendido com Multi-tenant e Auditoria.
   */
  private get db() {
    return this.prisma.extended;
  }

  /**
   * 🔥 Gera senha temporária aleatória
   */
  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // ===========================================================================
  // 📝 ESCRITA (CREATE / UPDATE / DELETE)
  // ===========================================================================

  // ============================================================================
  // REGRAS DE CRIAÇÃO DE USUÁRIOS POR PERMISSÃO
  // ============================================================================
  // MASTER → cria usuários com role = ADM (cargo opcional)
  // ADM    → cria usuários com role = EMPLOYER (cargo obrigatório)
  // ============================================================================

  public async createUser(data: CreateUserDto): Promise<User> {
    const { password: providedPassword, ...rest } = data;
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    this.logger.log(`Iniciando criação de usuário: ${rest.email}`);

    // 🔥 Gera senha temporária se não veio no DTO
    const temporaryPassword = providedPassword || this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    let targetCompanyId = tenantId;
    let targetRole: UserRole;

    // 🔥 REGRA CORRIGIDA
    if (isMaster) {
      // MASTER sempre cria ADMIN (a não ser que explicitamente informe outra role)
      targetRole = data.role || UserRole.ADMIN;
      if (data.companyId) targetCompanyId = data.companyId;
    } else {
      // ADMIN sempre cria EMPLOYER
      targetRole = UserRole.EMPLOYER;
    }

    this.logger.log(`📌 Role definida: ${targetRole} (isMaster: ${isMaster})`);

    // 🔥 Formatar telefone (adicionar 55 se não tiver)
    let formattedContact = rest.contact;
    if (formattedContact) {
      let numbersOnly = formattedContact.replace(/\D/g, '');
      if (!numbersOnly.startsWith('55')) {
        numbersOnly = `55${numbersOnly}`;
      }
      formattedContact = numbersOnly;
    }

    try {
      const userData: any = {
        name: rest.name,
        email: rest.email,
        password: hashedPassword,
        contact: formattedContact,
        status: rest.status || SimpleStatus.ACTIVE,
        role: targetRole,
        companyId: targetCompanyId,
      };

      // Documento opcional
      if (rest.document !== undefined && rest.document !== '') {
        userData.document = rest.document;
      }

      // 🔥 REGRA 2 (ADM): Cargo profissional é obrigatório
      if (!isMaster) {
        if (!rest.professionalRole || rest.professionalRole === '') {
          throw new BadRequestException(
            'Cargo profissional é obrigatório para criação de usuários',
          );
        }

        // Salva o nome do cargo
        userData.professionalRoleName = rest.professionalRole;
        this.logger.log(
          `📌 Salvando cargo profissional: "${rest.professionalRole}"`,
        );

        // Tenta vincular ao ID se existir
        const companyRole = await this.prisma.companyRole.findFirst({
          where: {
            companyId: targetCompanyId,
            name: {
              equals: rest.professionalRole,
              mode: 'insensitive',
            },
            status: SimpleStatus.ACTIVE,
          },
        });

        if (companyRole) {
          userData.professionalRoleId = companyRole.id;
        }
      }

      // Cargo na empresa (opcional para ambos)
      if (rest.companyRoleId !== undefined && rest.companyRoleId !== '') {
        userData.companyRoleId = rest.companyRoleId;
      }

      this.logger.log(`📦 Criando usuário com role: ${targetRole}`);

      const newUser = await this.db.user.create({
        data: userData,
        include: {
          company: { select: { id: true, name: true } },
          companyRole: { select: { id: true, name: true } },
        },
      });

      this.logger.log(`✅ Usuário criado com sucesso: ${newUser.id}`);

      // 🔥 ENVIA E-MAIL DE BOAS-VINDAS
      try {
        await this.mailService.sendWelcomeEmail(
          newUser.email,
          newUser.name,
          temporaryPassword, // Envia a senha original (não o hash)
        );
        this.logger.log(`📧 E-mail de boas-vindas enviado para ${newUser.email}`);
      } catch (emailError: any) {
        this.logger.error(
          `❌ Erro ao enviar e-mail de boas-vindas para ${newUser.email}: ${emailError.message}`,
        );
        // Não bloqueia a criação do usuário se o e-mail falhar
      }

      return newUser;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email ou CPF já cadastrados.');
      }
      if (error instanceof BadRequestException) {
        throw error;
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

    // 🔥 VERIFICAÇÃO: Garantir que companyId não seja null
    const companyId = existingUser.companyId;
    if (!companyId) {
      throw new BadRequestException('Usuário não está vinculado a uma empresa');
    }

    const userData: any = {};

    // 🔥 Campos básicos
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

    // 🔥 Status (se veio no updateFields)
    if (updateFields.status !== undefined) {
      userData.status = updateFields.status;
    }

    // =========================================================================
    // 🔥 TRATAMENTO DO CARGO PROFISSIONAL (professionalRole)
    // =========================================================================
    let finalProfessionalRoleId: string | null = null;
    let finalProfessionalRoleName: string | null = null;

    // 🔥 PRIORIDADE 1: Se veio professionalRoleId (ID direto), usa ele
    if (professionalRoleId !== undefined) {
      finalProfessionalRoleId =
        professionalRoleId === '' || professionalRoleId === null
          ? null
          : professionalRoleId;

      // Busca o nome do cargo para salvar também em professionalRoleName
      if (finalProfessionalRoleId) {
        const roleFound = await this.prisma.companyRole.findFirst({
          where: {
            id: finalProfessionalRoleId,
            companyId: companyId,
          },
          select: { name: true },
        });
        finalProfessionalRoleName = roleFound?.name || null;
      } else {
        finalProfessionalRoleName = null;
      }

      this.logger.log(
        `📌 Usando professionalRoleId direto: ${finalProfessionalRoleId} -> nome: ${finalProfessionalRoleName}`,
      );
    }
    // 🔥 PRIORIDADE 2: Se veio professionalRole (nome), busca o ID
    else if (professionalRole !== undefined) {
      if (professionalRole === '' || professionalRole === null) {
        finalProfessionalRoleId = null;
        finalProfessionalRoleName = null;
        this.logger.log(`🗑️ Removendo cargo profissional do usuário`);
      } else {
        this.logger.log(
          `🔍 Buscando cargo pelo nome: "${professionalRole}" para empresa: ${companyId}`,
        );

        const companyRoleFound = await this.prisma.companyRole.findFirst({
          where: {
            companyId: companyId,
            name: {
              equals: professionalRole,
              mode: 'insensitive',
            },
            status: SimpleStatus.ACTIVE,
          },
          select: { id: true, name: true },
        });

        if (companyRoleFound) {
          finalProfessionalRoleId = companyRoleFound.id;
          finalProfessionalRoleName = companyRoleFound.name;
          this.logger.log(
            `✅ Cargo "${professionalRole}" encontrado com ID: ${companyRoleFound.id}`,
          );
        } else {
          this.logger.warn(
            `⚠️ Cargo "${professionalRole}" NÃO encontrado para a empresa ${companyId}`,
          );
          // Mantém o valor anterior
          finalProfessionalRoleId = existingUser.professionalRoleId || null;
          finalProfessionalRoleName = existingUser.professionalRoleName || null;
        }
      }
    }
    // 🔥 PRIORIDADE 3: Se não veio nenhum dos dois, mantém os valores atuais
    else {
      finalProfessionalRoleId = existingUser.professionalRoleId || null;
      finalProfessionalRoleName = existingUser.professionalRoleName || null;
    }

    // Aplica os valores finais ao userData
    userData.professionalRoleId = finalProfessionalRoleId;
    userData.professionalRoleName = finalProfessionalRoleName;

    // =========================================================================
    // 🔥 CARGO NA EMPRESA (companyRole)
    // =========================================================================
    if (companyRoleId !== undefined) {
      userData.companyRoleId =
        companyRoleId === '' || companyRoleId === null ? null : companyRoleId;
    }

    // =========================================================================
    // 🔥 ROLE DO SISTEMA: apenas MASTER pode alterar
    // =========================================================================
    if (role && isMaster) {
      userData.role = role;
    } else if (role && !isMaster) {
      this.logger.warn(
        `⚠️ Tentativa de alteração de Role bloqueada para o usuário ${id}`,
      );
    }

    // =========================================================================
    // 🔥 SENHA: se fornecida, faz hash
    // =========================================================================
    if (password) {
      userData.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    this.logger.log(`📦 Dados finais para atualização:`, userData);

    // =========================================================================
    // 🔥 EXECUTAR A ATUALIZAÇÃO
    // =========================================================================
    const updatedUser = await this.db.user.update({
      where: { id },
      data: userData,
      select: {
        id: true,
        name: true,
        email: true,
        contact: true,
        document: true,
        professionalRoleId: true,
        professionalRoleName: true,
        professionalRole: {
          select: {
            id: true,
            name: true,
          },
        },
        status: true,
        role: true,
        companyId: true,
        companyRoleId: true,
        companyRole: {
          select: {
            id: true,
            name: true,
            level: true,
            description: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    // =========================================================================
    // 🔥 FORMATAR A RESPOSTA PARA O FRONTEND
    // =========================================================================
    const formattedUser = {
      ...updatedUser,
      professionalRole:
        updatedUser.professionalRoleName ||
        updatedUser.professionalRole?.name ||
        null,
      professionalRoleName: undefined,
    };

    this.logger.log(`✅ Usuário ${id} atualizado com sucesso!`);
    this.logger.log(
      `📌 professionalRole final: ${formattedUser.professionalRole}`,
    );

    return formattedUser as any;
  }

  public async removeUser(userId: string): Promise<User> {
    await this.findUserById(userId);
    return await this.db.user.delete({
      where: { id: userId },
    });
  }

  public async findUserById(userId: string): Promise<any> {
    this.logger.log(`🔍 Buscando usuário por ID: ${userId}`);

    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        contact: true,
        document: true,
        professionalRoleName: true,
        professionalRoleId: true,
        professionalRole: {
          select: { id: true, name: true },
        },
        status: true,
        role: true,
        companyId: true,
        company: { select: { id: true, name: true } },
        companyRole: {
          select: { id: true, name: true, level: true, description: true },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`📦 Usuário encontrado:`, {
      id: user?.id,
      name: user?.name,
      companyId: user?.companyId,
      professionalRoleName: user?.professionalRoleName,
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado ou acesso negado.');
    }

    if (!user.companyId) {
      throw new BadRequestException('Usuário não está vinculado a uma empresa');
    }

    return {
      ...user,
      professionalRole:
        user.professionalRoleName || user.professionalRole?.name || null,
      professionalRoleName: undefined,
    } as any;
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

    if (filters.professionalRole) {
      where.professionalRoleName = {
        contains: filters.professionalRole,
        mode: 'insensitive',
      };
      delete where.professionalRole;
    }

    Object.keys(where).forEach(
      (key) => where[key] === undefined && delete where[key],
    );

    if (!isMaster) {
      where.companyId = tenantId;
    }

    this.logger.log(`🔍 findAll - where:`, where);

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        skip,
        take: limit,
        where,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          contact: true,
          document: true,
          professionalRoleName: true,
          professionalRole: {
            select: {
              id: true,
              name: true,
            },
          },
          status: true,
          role: true,
          companyId: true,
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

    const formattedData = data.map((user) => ({
      ...user,
      professionalRole:
        user.professionalRoleName || user.professionalRole?.name || null,
    }));

    return { data: formattedData as any, total };
  }

  public async findUsersByCompany(companyId: string): Promise<User[]> {
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    if (!isMaster && companyId !== tenantId) {
      throw new ForbiddenException(
        'Acesso negado: Você só pode listar membros da sua própria empresa.',
      );
    }

    const users = await this.db.user.findMany({
      where: { companyId, status: SimpleStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        contact: true,
        professionalRoleName: true,
        professionalRole: {
          select: { name: true },
        },
        companyRole: { select: { id: true, name: true, level: true } },
      },
    });

    return users.map((user) => ({
      ...user,
      professionalRole:
        user.professionalRoleName || user.professionalRole?.name || null,
    })) as any;
  }

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

    const users = await this.db.user.findMany({
      where: {
        ...where,
        OR: [
          {
            professionalRoleName: {
              contains: professionalRole,
              mode: 'insensitive',
            },
          },
          {
            professionalRole: {
              name: {
                contains: professionalRole,
                mode: 'insensitive',
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        contact: true,
        professionalRoleName: true,
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

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      contact: user.contact,
      professionalRole:
        user.professionalRoleName || user.professionalRole?.name || null,
      status: user.status,
      company: user.company,
      companyRole: user.companyRole,
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