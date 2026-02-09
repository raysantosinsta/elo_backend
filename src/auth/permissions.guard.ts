/* eslint-disable prettier/prettier */
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
    // 1. Descobrir quais permissões a Rota exige
    const requiredPermissions = this.reflector.getAllAndOverride<AppPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se a rota não exige permissão específica, deixa passar
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 2. Pegar o usuário da Request (injetado pelo JWT Strategy)
    const request = context.switchToHttp().getRequest();
    const userJwt = request.user;

    if (!userJwt || !userJwt.id) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    // 3. Buscar dados frescos do banco
    const user = await this.prisma.user.findUnique({
      where: { id: userJwt.id },
      select: { role: true, professionalRole: true },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado.');

    // 4. Bypass para MASTER e ADMIN (Superusuários)
    if (user.role === UserRole.MASTER || user.role === UserRole.ADMIN) {
      return true;
    }

    // 5. Mapear: Role + professionalRole -> Lista de Permissões
    const userPermissions = this.mapRoleAndprofessionalRoleToPermissions(
      user.role,
      user.professionalRole,
    );

    // 6. Verificar se o usuário tem TODAS as permissões exigidas
    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasPermission) {
      this.logger.warn(
        `Acesso negado: User ${userJwt.id} (Role: ${user.role}, professionalRole: ${user.professionalRole}) tentou acessar recurso protegido.`,
      );
      throw new ForbiddenException(
        'Você não possui permissão para realizar esta ação.',
      );
    }

    return true;
  }

  /**
   * Transforma Role + professionalRole em uma lista de Capabilities.
   */
  private mapRoleAndprofessionalRoleToPermissions(
    role: UserRole,
    professionalRole?: string | null,
  ): AppPermission[] {
    const permissions: AppPermission[] = [];
    const normalizedProfessionalRole = professionalRole?.trim().toLowerCase() || '';

    // --- REGRA GERAL (Base) ---
    // Todo usuário autenticado deve ter permissões básicas de leitura/escrita de itens
    permissions.push(AppPermission.MANAGE_ITEMS);

    // 🔥 CORREÇÃO PRINCIPAL AQUI:
    // Liberamos a permissão de "Gerenciar Itens do Fluxo" (Mover/Concluir) para TODOS.
    // A lógica de "qual coluna ele pode mexer" é feita no FlowService (validateStageAccess).
    permissions.push(AppPermission.MANAGE_FLOW_ITEMS);

    // --- REGRA DE GESTÃO (Criar Fluxos/Etapas/Templates) ---
    // Apenas Gestores
    if (role === UserRole.ADMIN) {
      permissions.push(AppPermission.MANAGE_FLOW);
      permissions.push(AppPermission.MANAGE_STAGE);
      permissions.push(AppPermission.MANAGE_KANBAN_COLUMNS);
    }
    // Regra específica para Employer que é Gestor
    else if (role === UserRole.EMPLOYER) {
      if (
        normalizedProfessionalRole === 'gestao de producao' ||
        normalizedProfessionalRole === 'gerente'
      ) {
        permissions.push(AppPermission.MANAGE_FLOW);
        permissions.push(AppPermission.MANAGE_STAGE);
        permissions.push(AppPermission.MANAGE_KANBAN_COLUMNS);
      }
    }

    return permissions;
  }
}