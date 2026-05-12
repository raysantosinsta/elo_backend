/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type Cache } from 'cache-manager';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';

import { SimpleStatus, UserRole } from '@prisma/client';
import {
  CreateCompanyRoleDto,
  UpdateCompanyRoleDto,
} from './dto/create-company-role.dto';

@Injectable()
export class CompanyRolesService {
  private readonly logger = new Logger(CompanyRolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly cls: ClsService,
  ) {}

  private get db() {
    return this.prisma;
  }

  /**
   * Obtém o companyId do usuário autenticado (NUNCA do body)
   */
  private getCompanyIdFromAuth(): string {
    const tenantId = this.cls.get<string>('tenantId');
    const userRole = this.cls.get<UserRole>('userRole');
    const isMaster = this.cls.get<boolean>('isMaster');

    if (!tenantId && !isMaster) {
      throw new ForbiddenException('Usuário não está associado a uma empresa');
    }

    return tenantId;
  }

  /**
   * Valida se o usuário tem permissão para gerenciar cargos
   */
  private async validateRoleManagementAccess(companyId: string): Promise<void> {
    const userRole = this.cls.get<UserRole>('userRole');
    const userTenantId = this.cls.get<string>('tenantId');
    const isMaster = this.cls.get<boolean>('isMaster');

    if (isMaster || userRole === UserRole.MASTER) {
      return;
    }

    if (userRole === UserRole.ADMIN) {
      if (userTenantId !== companyId) {
        throw new ForbiddenException(
          'Você não pode gerenciar cargos de outra empresa',
        );
      }
      return;
    }

    throw new ForbiddenException(
      'Você não tem permissão para gerenciar cargos',
    );
  }

  /**
   * Valida se o cargo pertence à empresa correta
   */
  private async validateRoleBelongsToCompany(
    roleId: string,
    companyId: string,
  ): Promise<void> {
    const role = await this.db.companyRole.findUnique({
      where: { id: roleId },
      select: { companyId: true },
    });

    if (!role) {
      throw new NotFoundException('Cargo não encontrado');
    }

    if (role.companyId !== companyId) {
      throw new ForbiddenException('Este cargo não pertence à sua empresa');
    }
  }

  // ===========================================================================
  // 🔥 CRUD BÁSICO
  // ===========================================================================

  /**
   * Cria um novo cargo para a empresa do usuário autenticado
   */
  async create(createDto: CreateCompanyRoleDto) {
    const companyId = this.getCompanyIdFromAuth();
    await this.validateRoleManagementAccess(companyId);

    const existingRole = await this.db.companyRole.findFirst({
      where: {
        companyId,
        name: createDto.name,
        status: SimpleStatus.ACTIVE,
      },
    });

    if (existingRole) {
      throw new ConflictException(
        `Já existe um cargo com o nome "${createDto.name}" nesta empresa`,
      );
    }

    const userId = this.cls.get<string>('userId');

    const role = await this.db.companyRole.create({
      data: {
        name: createDto.name,
        description: createDto.description,
        level: createDto.level ?? 1,
        companyId,
        userCreateId: userId,
        status: SimpleStatus.ACTIVE,
      },
    });

    await this.clearRolesCache(companyId);

    return role;
  }

  /**
   * Lista todos os cargos da empresa (com paginação)
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    includeInactive: boolean = false,
  ) {
    const companyId = this.getCompanyIdFromAuth();

    const userRole = this.cls.get<UserRole>('userRole');
    const isMaster = this.cls.get<boolean>('isMaster');

    if (
      !isMaster &&
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.EMPLOYER
    ) {
      throw new ForbiddenException('Você não tem permissão para listar cargos');
    }

    const cacheKey = `company_roles_list_${companyId}_p${page}_l${limit}_i${includeInactive}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * limit;

    const where: any = { companyId };
    if (!includeInactive) {
      where.status = SimpleStatus.ACTIVE;
    }

    const [data, total] = await Promise.all([
      this.db.companyRole.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: {
              companyRoleUsers: true,
              professionalRoleUsers: true,
            },
          },
        },
      }),
      this.db.companyRole.count({ where }),
    ]);

    const result = {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };

    await this.cacheManager.set(cacheKey, result, 300000);

    return result;
  }

  /**
   * Busca um cargo específico pelo ID
   */
  async findOne(id: string) {
    const companyId = this.getCompanyIdFromAuth();

    const role = await this.db.companyRole.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        _count: {
          select: {
            companyRoleUsers: true,
            professionalRoleUsers: true,
          },
        },
        companyRoleUsers: {
          select: {
            id: true,
            name: true,
            email: true,
          },
          take: 10,
        },
        professionalRoleUsers: {
          select: {
            id: true,
            name: true,
            email: true,
          },
          take: 10,
        },
      },
    });

    if (!role) {
      throw new NotFoundException(
        'Cargo não encontrado ou não pertence à sua empresa',
      );
    }

    return role;
  }

  /**
   * Atualiza um cargo existente
   */
  async update(id: string, updateDto: UpdateCompanyRoleDto) {
    const companyId = this.getCompanyIdFromAuth();
    await this.validateRoleManagementAccess(companyId);
    await this.validateRoleBelongsToCompany(id, companyId);

    if (updateDto.name) {
      const existingRole = await this.db.companyRole.findFirst({
        where: {
          companyId,
          name: updateDto.name,
          id: { not: id },
          status: SimpleStatus.ACTIVE,
        },
      });

      if (existingRole) {
        throw new ConflictException(
          `Já existe um cargo com o nome "${updateDto.name}" nesta empresa`,
        );
      }
    }

    const userId = this.cls.get<string>('userId');

    const updatedRole = await this.db.companyRole.update({
      where: { id },
      data: {
        ...updateDto,
        userUpdateId: userId,
      },
    });

    await this.clearRolesCache(companyId);
    await this.cacheManager.del(`company_role_${id}`);

    return updatedRole;
  }

  /**
   * Remove (soft delete) um cargo
   */
  async remove(id: string) {
    const companyId = this.getCompanyIdFromAuth();
    await this.validateRoleManagementAccess(companyId);
    await this.validateRoleBelongsToCompany(id, companyId);

    // Verificar se existem usuários vinculados a este cargo como companyRole
    const companyRoleUsersCount = await this.db.user.count({
      where: { companyRoleId: id },
    });

    // Verificar se existem usuários vinculados a este cargo como professionalRole
    const professionalRoleUsersCount = await this.db.user.count({
      where: { professionalRoleId: id },
    });

    const totalUsers = companyRoleUsersCount + professionalRoleUsersCount;

    if (totalUsers > 0) {
      throw new BadRequestException(
        `Não é possível excluir este cargo pois existem ${totalUsers} usuário(s) vinculado(s) a ele (${companyRoleUsersCount} como cargo de empresa, ${professionalRoleUsersCount} como cargo profissional). Remova os vínculos primeiro.`,
      );
    }

    const deletedRole = await this.db.companyRole.update({
      where: { id },
      data: { status: SimpleStatus.INACTIVE },
    });

    await this.clearRolesCache(companyId);
    await this.cacheManager.del(`company_role_${id}`);

    return deletedRole;
  }

  /**
   * Restaura um cargo inativado
   */
  async restore(id: string) {
    const companyId = this.getCompanyIdFromAuth();
    await this.validateRoleManagementAccess(companyId);
    await this.validateRoleBelongsToCompany(id, companyId);

    const restoredRole = await this.db.companyRole.update({
      where: { id },
      data: { status: SimpleStatus.ACTIVE },
    });

    await this.clearRolesCache(companyId);
    await this.cacheManager.del(`company_role_${id}`);

    return restoredRole;
  }

  // ===========================================================================
  // 🔥 GERENCIAMENTO DE COMPANY ROLE (Cargo na empresa)
  // ===========================================================================

  /**
   * Atribui um cargo de empresa a um usuário
   */
  async assignCompanyRoleToUser(userId: string, roleId: string) {
    const companyId = this.getCompanyIdFromAuth();
    await this.validateRoleManagementAccess(companyId);
    await this.validateRoleBelongsToCompany(roleId, companyId);

    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        companyId,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado ou não pertence à sua empresa',
      );
    }

    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: { companyRoleId: roleId },
      select: {
        id: true,
        name: true,
        email: true,
        companyRoleId: true,
      },
    });

    await this.cacheManager.del(`user_${userId}`);

    return updatedUser;
  }

  /**
   * Remove o cargo de empresa de um usuário
   */
  async removeCompanyRoleFromUser(userId: string) {
    const companyId = this.getCompanyIdFromAuth();

    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        companyId,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado ou não pertence à sua empresa',
      );
    }

    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: { companyRoleId: null },
      select: {
        id: true,
        name: true,
        email: true,
        companyRoleId: true,
      },
    });

    await this.cacheManager.del(`user_${userId}`);

    return updatedUser;
  }

  /**
   * Lista todos os usuários de um cargo de empresa específico
   */
  async getCompanyRoleUsers(
    roleId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const companyId = this.getCompanyIdFromAuth();
    await this.validateRoleBelongsToCompany(roleId, companyId);

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.db.user.findMany({
        where: {
          companyRoleId: roleId,
          companyId,
        },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.db.user.count({
        where: {
          companyRoleId: roleId,
          companyId,
        },
      }),
    ]);

    return {
      data: users,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  // ===========================================================================
  // 🔥 GERENCIAMENTO DE PROFESSIONAL ROLE (Cargo profissional)
  // ===========================================================================

  /**
   * Atribui um cargo profissional a um usuário
   */
  async assignProfessionalRoleToUser(userId: string, roleId: string) {
    const companyId = this.getCompanyIdFromAuth();
    await this.validateRoleManagementAccess(companyId);
    await this.validateRoleBelongsToCompany(roleId, companyId);

    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        companyId,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado ou não pertence à sua empresa',
      );
    }

    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: { professionalRoleId: roleId },
      select: {
        id: true,
        name: true,
        email: true,
        professionalRoleId: true,
      },
    });

    await this.cacheManager.del(`user_${userId}`);

    return updatedUser;
  }

  /**
   * Remove o cargo profissional de um usuário
   */
  async removeProfessionalRoleFromUser(userId: string) {
    const companyId = this.getCompanyIdFromAuth();

    const user = await this.db.user.findFirst({
      where: {
        id: userId,
        companyId,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado ou não pertence à sua empresa',
      );
    }

    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: { professionalRoleId: null },
      select: {
        id: true,
        name: true,
        email: true,
        professionalRoleId: true,
      },
    });

    await this.cacheManager.del(`user_${userId}`);

    return updatedUser;
  }

  /**
   * Lista todos os usuários de um cargo profissional específico
   */
  async getProfessionalRoleUsers(
    roleId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const companyId = this.getCompanyIdFromAuth();
    await this.validateRoleBelongsToCompany(roleId, companyId);

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.db.user.findMany({
        where: {
          professionalRoleId: roleId,
          companyId,
        },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.db.user.count({
        where: {
          professionalRoleId: roleId,
          companyId,
        },
      }),
    ]);

    return {
      data: users,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  // ===========================================================================
  // 🔥 MÉTODOS UTILITÁRIOS
  // ===========================================================================

  /**
   * Limpa todos os caches relacionados aos cargos da empresa
   */
  private async clearRolesCache(companyId: string) {
    try {
      // 🔥 Buscar todas as chaves do cache que começam com o padrão
      const cacheKeys = [
        `company_roles_list_${companyId}_p`,
        `company_roles_all_active_${companyId}`,
        `company_role_`,
      ];

      // Usar o cache manager para deletar por padrão
      for (const keyPattern of cacheKeys) {
        try {
          // Para Redis ou cache manager que suporta delete por padrão
          // Infelizmente cache-manager não tem scan nativo, então vamos guardar as keys em um Set
          await this.cacheManager.del(keyPattern);
        } catch (error) {
          this.logger.warn(
            `Erro ao limpar cache para padrão ${keyPattern}: ${error.message}`,
          );
        }
      }

      // 🔥 SOLUÇÃO MAIS SIMPLES: Limpar todas as keys conhecidas
      // Para cada combinação possível de página e limite
      const pages = [1, 2, 3, 4, 5];
      const limits = [10, 20, 50, 100];
      const includeInactiveValues = [true, false];

      for (const page of pages) {
        for (const limit of limits) {
          for (const includeInactive of includeInactiveValues) {
            const cacheKey = `company_roles_list_${companyId}_p${page}_l${limit}_i${includeInactive}`;
            try {
              await this.cacheManager.del(cacheKey);
            } catch (error) {
              // Ignora erros individuais
            }
          }
        }
      }

      this.logger.log(`✅ Cache limpo para empresa ${companyId}`);
    } catch (error) {
      this.logger.error(`Erro ao limpar cache: ${error.message}`);
    }
  }

  /**
   * Busca um cargo pelo nome (case insensitive) dentro da empresa
   */
  async findByName(name: string) {
    const companyId = this.getCompanyIdFromAuth();

    const role = await this.db.companyRole.findFirst({
      where: {
        companyId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        status: SimpleStatus.ACTIVE,
      },
    });

    return role;
  }

  /**
   * Busca todos os cargos ativos da empresa (sem paginação)
   */
  async findAllActive() {
    const companyId = this.getCompanyIdFromAuth();
    const cacheKey = `company_roles_all_active_${companyId}`;

    // 🔥 Adicionar cache para este método também
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const roles = await this.db.companyRole.findMany({
      where: {
        companyId,
        status: SimpleStatus.ACTIVE,
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    await this.cacheManager.set(cacheKey, roles, 300000); // 5 minutos

    return roles;
  }
}
