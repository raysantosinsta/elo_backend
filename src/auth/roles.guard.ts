import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Lê os roles exigidos pelo decorator @Roles no método ou na classe
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 2. Se não houver roles exigidos, permite o acesso (a rota é aberta para qualquer logado)
    if (!requiredRoles) {
      return true;
    }

    // 3. Pega o usuário injetado pelo JwtAuthGuard
    const { user } = context.switchToHttp().getRequest();

    // Validação defensiva: Se chegou aqui sem usuário, algo falhou na autenticação anterior
    if (!user) {
      return false;
    }

    // 4. Verifica se o role do usuário está na lista permitida
    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
        throw new ForbiddenException('Você não tem permissão para acessar este recurso.');
    }

    return hasRole;
  }
}