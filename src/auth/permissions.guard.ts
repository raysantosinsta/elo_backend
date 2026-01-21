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
import { PrismaService } from '../prisma/prisma.service'; // Ajuste o import
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
    // (Assume-se que JwtAuthGuard e RolesGuard já rodaram)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 2. Pegar o usuário da Request (injetado pelo JWT Strategy)
    const request = context.switchToHttp().getRequest();
    const userJwt = request.user;

    if (!userJwt || !userJwt.id) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    // 3. Buscar dados frescos do banco (Role e professionalRole)
    // O JWT pode estar velho (ex: professionalRole mudou há 5 min). Buscamos no banco para garantir.
    // Nota: O seu PrismaService já aplica o filtro de tenant automaticamente se necessário,
    // mas aqui estamos buscando pelo ID direto.
    const user = await this.prisma.user.findUnique({
      where: { id: userJwt.id },
      select: { role: true, professionalRole: true }, // Certifique-se que o campo 'professionalRole' existe no seu Schema User
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado.');

    // 4. Bypass para MASTER e ADMIN (Opcional, mas recomendado)
    if (user.role === UserRole.MASTER || user.role === UserRole.ADMIN) {
      return true;
    }

    // 5. Mapear: professionalRole -> Permissões
    // Aqui está a regra de negócio centralizada!
    const userPermissions = this.mapRoleAndprofessionalRoleToPermissions(user.role, user.professionalRole);

    // 6. Verificar se o usuário tem TODAS as permissões exigidas
    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasPermission) {
      this.logger.warn(
        `Acesso negado: User ${userJwt.id} (Role: ${user.role}, professionalRole: ${user.professionalRole}) tentou acessar recurso protegido.`,
      );
      throw new ForbiddenException(
        'Você não possui permissão (professionalRole: Gestor de Processos) para realizar esta ação.',
      );
    }

    return true;
  }

  /**
   * Transforma Role + professionalRole em uma lista de Capabilities.
   * Se o RH mudar o nome do professionalRole, você só mexe AQUI.
   */
  private mapRoleAndprofessionalRoleToPermissions(role: UserRole, professionalRole?: string | null): AppPermission[] {
    const permissions: AppPermission[] = [];
    const normalizedprofessionalRole = professionalRole?.trim().toLowerCase() || '';

    // --- REGRA 2: ITENS ---
    // Todo usuário autenticado pode gerenciar itens (a segurança de tenant é feita pelo Prisma Service)
    permissions.push(AppPermission.MANAGE_ITEMS);

    // --- REGRA 1: FLUXO E ETAPA ---
    // Apenas Employer com professionalRole "Gestor de Processos"
    if (role === UserRole.EMPLOYER) {
      if (normalizedprofessionalRole === 'gestor de processos') {
        permissions.push(AppPermission.MANAGE_FLOW);
        permissions.push(AppPermission.MANAGE_STAGE);
        permissions.push(AppPermission.MANAGE_KANBAN_COLUMNS);
      }
    }

    return permissions;
  }
}