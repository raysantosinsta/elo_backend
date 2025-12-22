/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
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

// TODO: verificar se ta validando token corretamente sempre que uma rota protegida for acessada
/**
 * JwtAuthGuard (Guardião Global de Autenticação)
 * * Este Guard é responsável por proteger todas as rotas da aplicação por padrão.
 * Ele estende o 'AuthGuard' do NestJS/Passport usando a estratégia 'jwt'.
 * * FUNCIONALIDADES:
 * 1. Verifica se a rota possui o decorator @Public(). Se sim, deixa passar.
 * 2. Se não for pública, aciona o JwtStrategy para validar o token.
 * 3. Intercepta erros de validação para gerar logs de segurança e mensagens amigáveis.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
    * Lógica Principal de Decisão
    * Este método roda ANTES da estratégia JWT tentar validar o token.
    * * @param context O contexto da execução (contém Request, Response, etc)
    * @returns true (acesso permitido) ou a Promise de validação do token
    */
  canActivate(context: ExecutionContext) {
    // 1. Governança: Verifica metadados (Se a rota tem @Public)
    // getAllAndOverride procura o decorator no Método e depois na Classe
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // Se for pública, ignora a validação do token JWT e retorna true imediatamente
      return true;
    }

    // 2. Se não for pública, delega para a lógica padrão do AuthGuard
    // Isso vai chamar o JwtStrategy.validate() internamente
    return super.canActivate(context);
  }

  /**
    * Tratamento de Resultado da Estratégia (Pós-Validação)
    * Este método é chamado AUTOMATICAMENTE após o Passport tentar validar o token.
    * Aqui decidimos o que fazer se o token for inválido, expirado ou inexistente.
    * * @param err Erro técnico (se houver) retornado pelo Passport
    * @param user O objeto usuário retornado pelo JwtStrategy.validate() (se sucesso)
    * @param info Informações extras sobre o erro (ex: "TokenExpiredError")
    * @param context O contexto da requisição
    */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Extrai dados para Logs de Observabilidade
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;

    // Cenário de Falha: Se ocorreu erro técnico ou nenhum usuário foi encontrado
    if (err || !user) {
      // Traduz o erro técnico para uma mensagem legível
      const errorMessage = this.getErrorMessage(err, info);

      // Observabilidade: Log estruturado de falha (Nível WARN)
      // Importante para detectar tentativas de invasão ou problemas de sessão
      this.logger.warn({
        message: 'Falha de Autenticação',
        route: `${method} ${url}`,
        error: errorMessage,
        ip: request.ip, // Registra o IP para eventual bloqueio no firewall
      });

      // Se já existe um erro estruturado (ex: do banco), lança ele.
      if (err) {
        throw err;
      }
      // Se não, lança 401 Unauthorized com a mensagem traduzida
      throw new UnauthorizedException(errorMessage);

    }

    // Cenário de Sucesso:
    // Retorna o usuário para ser injetado no `req.user` dos Controllers
    return user;
  }

  /**
    * Tradutor de Erros
    * Converte erros técnicos da biblioteca 'passport'
    * em mensagens que o Frontend pode usar para decidir o que fazer (Refresh ou Logout).
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
            return 'Token inválido'; // Token malformado ou adulterado -> Logout
          case 'NotBeforeError':
            return 'Token ainda não é válido'; // Relógio do servidor desincronizado
        }
      }
      // Em alguns casos raros, o passport retorna uma string direta
      if (typeof info === 'string') {
        return info;
      }
    }

    return 'Não autenticado'; // Token ausente
  }
}