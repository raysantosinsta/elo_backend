/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AppPermission, PERMISSIONS_KEY } from './permissions.decorator';
import { UserRole } from '@prisma/client';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      AppPermission[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userJwt = request.user;

    if (!userJwt || !userJwt.id) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    // 🔥 Buscar usuário com o relacionamento professionalRole
    const user = await this.prisma.user.findUnique({
      where: { id: userJwt.id },
      select: {
        role: true,
        professionalRole: {
          select: { name: true },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado.');

    if (user.role === UserRole.MASTER || user.role === UserRole.ADMIN) {
      return true;
    }

    // 🔥 Pegar o nome do cargo profissional do relacionamento
    const professionalRoleName = user.professionalRole?.name || null;

    const userPermissions = this.mapRoleAndProfessionalRoleToPermissions(
      user.role,
      professionalRoleName,
    );

    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasPermission) {
      this.logger.warn(`⛔ Acesso negado para User ${userJwt.id}`);
      throw new ForbiddenException(
        'Você não possui permissão administrativa para realizar esta ação.',
      );
    }

    return true;
  }

  private mapRoleAndProfessionalRoleToPermissions(
    role: UserRole,
    professionalRole?: string | null,
  ): AppPermission[] {
    const permissions: AppPermission[] = [];
    const profRole = professionalRole?.trim().toLowerCase() || '';

    const managementProfRoles = [
      'gerente',
      'gerente de produção',
      'gestao de producao',
      'diretor',
    ];

    const isManagerByTitle = managementProfRoles.includes(profRole);

    if (
      role === UserRole.ADMIN ||
      (role === UserRole.EMPLOYER && isManagerByTitle)
    ) {
      permissions.push(
        AppPermission.MANAGE_FLOW,
        AppPermission.MANAGE_STAGE,
        AppPermission.MANAGE_KANBAN_COLUMNS,
      );
    }

    return permissions;
  }
}
