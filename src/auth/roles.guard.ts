/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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

/**
 * Guardião de Autorização por Papéis (RBAC - Role Based Access Control).
 * * @description
 * Este Guard é responsável por validar se o usuário autenticado possui o nível de acesso (Role)
 * necessário para consumir um endpoint ou controller específico.
 * * @class RolesGuard
 * @implements {CanActivate}
 * * @architecture
 * 1. **Dependência:** Este Guard assume que o usuário JÁ foi autenticado anteriormente (ex: pelo `JwtAuthGuard`).
 * Ele espera encontrar o objeto `user` injetado na requisição (`request.user`).
 * 2. **Metadados:** Ele lê as permissões definidas pelo decorator `@Roles(...)`.
 * 3. **Hierarquia:** Permissões no nível do Método sobrescrevem permissões no nível da Classe (Controller).
 * * @example
 * // Uso no Controller (Global para a classe ou específico por rota)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.ADMIN)
 * export class AdminController {}
 */
@Injectable()
export class RolesGuard implements CanActivate {
  
  /**
   * Construtor do Guard.
   * @param {Reflector} reflector - Utilitário do NestJS para ler metadados injetados por decorators (@Roles).
   */
  constructor(private reflector: Reflector) {}

  /**
   * Executa a lógica de validação de permissões.
   * * @param {ExecutionContext} context - O contexto da execução atual (contém Request, Response, Handler, Class).
   * @returns {boolean} Retorna `true` se o acesso for permitido. Caso contrário, lança uma Exceção HTTP.
   * * @throws {UnauthorizedException} (401) Se o usuário não estiver logado (request.user undefined).
   * @throws {ForbiddenException} (403) Se o usuário estiver logado, mas não tiver a Role necessária.
   */
  canActivate(context: ExecutionContext): boolean {
    // 1. Busca os roles definidos nos metadados.
    // O método `getAllAndOverride` é crucial aqui: ele verifica primeiro se há roles no HANDLER (Método).
    // Se houver, usa eles. Se não, busca na CLASS (Controller).
    // Isso permite que um Controller seja todo 'ADMIN', mas uma rota específica seja 'PUBLIC' ou 'USER'.
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 2. Validação de Rota Pública ou Sem Restrição
    // Se a rota não possui o decorator @Roles, significa que não há restrição de nível de acesso específica.
    // O Guard permite a passagem (assumindo que a autenticação básica já foi feita ou não é necessária).
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 3. Extração do Usuário
    // Obtém o objeto Request HTTP para acessar os dados do usuário injetados pelo Passport/JWT Strategy.
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 4. Validação Defensiva de Autenticação
    // Se chegamos aqui, a rota exige uma Role. Para ter Role, precisa ter Usuário.
    // Se `user` não existe, significa que o `JwtAuthGuard` falhou ou não foi executado antes deste Guard.
    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado ou contexto de segurança inválido.');
    }

    // 5. Verificação de Correspondência (Match)
    // Verifica se a Role do usuário atual existe dentro do array de Roles permitidas para a rota.
    // Ex: Rota exige ['ADMIN', 'MASTER']. Usuário é 'USER'. Resultado: false.
    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      // Bloqueio de Acesso (403 Forbidden).
      // Lança a exceção padrão, que será interceptada pelo `AllExceptionsFilter` 
      // para retornar uma mensagem amigável ao frontend (ex: "Você não tem permissão...").
      throw new ForbiddenException(); 
    }

    // Acesso Permitido
    return true;
  }
}