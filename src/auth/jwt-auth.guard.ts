/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator'; // Importe do arquivo criado no passo anterior

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * Lógica Principal de Decisão (Gatekeeper)
   */
  canActivate(context: ExecutionContext) {
    // 1. Governança: Verifica se a rota é Pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // Se for pública, ignora a validação do token JWT e passa direto
      return true;
    }

    // 2. Se não for pública, delega para a estratégia do Passport (JwtStrategy)
    return super.canActivate(context);
  }

  /**
   * Tratamento de Resultado da Estratégia
   * Chamado após o JwtStrategy.validate() retornar ou falhar
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Contexto para logs
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;

    // Se houver erro ou nenhum usuário foi retornado pelo Strategy
    if (err || !user) {
      const errorMessage = this.getErrorMessage(err, info);
      
      // Observabilidade: Log estruturado de falha (apenas Warn para não poluir erro)
      this.logger.warn({
        message: 'Falha de Autenticação',
        route: `${method} ${url}`,
        error: errorMessage,
        ip: request.ip,
      });

      throw err || new UnauthorizedException(errorMessage);
    }

    // Sucesso silencioso em produção, debug em dev
    /* Performance: Evitamos logs excessivos no "caminho feliz" em produção.
       O log de acesso deve ser feito por um Middleware ou Interceptor de Logging, não pelo Guard.
    */
    
    return user;
  }

  /**
   * Tradução de Erros do Passport/JWT para mensagens amigáveis ao Client
   */
  private getErrorMessage(err: any, info: any): string {
    if (err) {
      return err.message || 'Erro interno de autenticação';
    }
    
    if (info) {
      if (info instanceof Error) {
        switch (info.name) {
          case 'TokenExpiredError':
            return 'Token expirado'; // Frontend deve disparar Refresh Token
          case 'JsonWebTokenError':
            return 'Token inválido'; // Frontend deve fazer Logout
          case 'NotBeforeError':
            return 'Token ainda não é válido';
        }
      }
      // Info pode ser string em alguns casos do passport
      if (typeof info === 'string') {
          return info; 
      }
    }
    
    return 'Não autenticado';
  }
}