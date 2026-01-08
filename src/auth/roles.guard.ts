import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Busca os roles definidos (Prioriza Método > Classe)
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 2. Se a rota não exige roles, permite o acesso
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 3. Obtém a requisição e o usuário
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 4. Validação Defensiva: Usuário não autenticado
    if (!user) {
      // Se não há usuário, o problema é autenticação (401), não permissão (403)
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    // 5. Verifica se o papel do usuário está na lista de papéis permitidos
    // Nota: Garante que comparamos strings ou enums corretamente
    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      // Lançamos o ForbiddenException. 
      // O seu AllExceptionsFilter vai capturar isso e trocar pela mensagem em PT-BR.
      throw new ForbiddenException(); 
    }

    return true;
  }
}