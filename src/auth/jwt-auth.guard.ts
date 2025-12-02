// auth/jwt-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    this.logger.debug(`🛡️ [GUARD] Verificando autenticação para rota: ${request.url}`);
    this.logger.debug(`🛡️ [GUARD] Headers:`, request.headers);
    
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    this.logger.debug(`🛡️ [GUARD] handleRequest chamado`);
    this.logger.debug(`🛡️ [GUARD] Erro:`, err);
    this.logger.debug(`🛡️ [GUARD] Usuário:`, user);
    this.logger.debug(`🛡️ [GUARD] Info:`, info);

    if (err || !user) {
      this.logger.error(`🛡️ [GUARD] Falha na autenticação:`, { err, user, info });
      throw err || new UnauthorizedException('Não autenticado');
    }

    this.logger.debug(`🛡️ [GUARD] Autenticação bem-sucedida para usuário: ${user.email}`);
    return user;
  }
}