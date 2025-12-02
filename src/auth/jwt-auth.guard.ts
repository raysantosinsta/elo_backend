/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// auth/jwt-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // Log apenas em desenvolvimento
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`🛡️ [GUARD] Verificando autenticação para rota: ${request.method} ${request.url}`);
      this.logger.debug(`🛡️ [GUARD] Headers: ${JSON.stringify({
        authorization: request.headers.authorization ? 'Present' : 'Missing',
        cookie: request.headers.cookie ? 'Present' : 'Missing'
      })}`);
    }
    
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`🛡️ [GUARD] handleRequest chamado`);
    }

    if (err || !user) {
      const errorMessage = this.getErrorMessage(err, info);
      this.logger.error(`🛡️ [GUARD] Falha na autenticação: ${errorMessage}`);
      throw err || new UnauthorizedException(errorMessage);
    }

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`🛡️ [GUARD] Autenticação bem-sucedida para usuário: ${user.email}`);
    }
    
    return user;
  }

  private getErrorMessage(err: any, info: any): string {
    if (err) {
      return err.message || 'Erro de autenticação';
    }
    
    if (info) {
      switch (info.name) {
        case 'TokenExpiredError':
          return 'Token expirado';
        case 'JsonWebTokenError':
          return 'Token inválido';
        case 'NotBeforeError':
          return 'Token não ativo';
        default:
          return 'Não autenticado';
      }
    }
    
    return 'Não autenticado';
  }
}