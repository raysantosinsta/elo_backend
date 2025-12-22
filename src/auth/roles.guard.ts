import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guard responsável por verificar se o usuário autenticado possui as permissões (roles)
 * necessárias para acessar uma rota específica.
 * * @description
 * O `RolesGuard` utiliza o `Reflector` para buscar metadados definidos através do decorator `@Roles`.
 * Ele deve ser utilizado preferencialmente após um Guard de autenticação (como o JWT),
 * pois depende do objeto `user` estar presente na requisição.
 * * @example
 * // Aplicação global ou por controller:
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.ADMIN)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  /**
   * @param reflector - Utilitário do NestJS para extrair metadados de classes e manipuladores de rota.
   */
  constructor(private reflector: Reflector) {}

  /**
   * Determina se a requisição atual tem permissão para prosseguir.
   * * @param context - O contexto de execução contendo detalhes sobre a requisição HTTP e o handler da rota.
   * @returns `true` se o acesso for concedido.
   * @throws ForbiddenException se o usuário não possuir um dos papéis exigidos.
   */
  canActivate(context: ExecutionContext): boolean {
    // 1. Lê os roles exigidos pelo decorator @Roles no método ou na classe.
    // O getAllAndOverride prioriza o metadado do método sobre o da classe.
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 2. Se não houver roles exigidos (null/undefined), a rota é considerada pública/aberta.
    if (!requiredRoles) {
      return true;
    }

    // 3. Extrai o usuário do objeto de requisição.
    // Importante: O usuário é injetado aqui previamente por um Passport Strategy (ex: JwtStrategy).
    const { user } = context.switchToHttp().getRequest();

    // Validação defensiva: Impede acesso se o Guard de autenticação não foi executado antes.
    if (!user) {
      return false;
    }

    // 4. Verifica se a função (role) do usuário coincide com alguma das funções permitidas.
    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso.',
      );
    }

    return hasRole;
  }
}
