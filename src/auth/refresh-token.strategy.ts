/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UserRole } from '@prisma/client';

/**
 * Estrutura de dados esperada dentro do payload decodificado do Refresh Token.
 */
interface RefreshTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

/**
 * Estratégia de autenticação para renovação de tokens (Refresh Token).
 * * Esta classe é responsável por extrair o token de múltiplas fontes,
 * validar a assinatura JWT e preparar os dados para o processo de refresh.
 * * @usageNotes
 * A estratégia utiliza o nome 'jwt-refresh' para ser referenciada em Guards:
 * `@UseGuards(AuthGuard('jwt-refresh'))`
 */
@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  private readonly logger = new Logger(RefreshTokenStrategy.name);

  /**
   * Configura a estratégia de validação do Refresh Token.
   * * @param configService - Provedor de configuração para acessar a chave secreta.
   * @throws Error se a variável de ambiente `JWT_REFRESH_SECRET` não estiver definida.
   */
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET missing');

    super({
      /**
       * Define a ordem de extração do token:
       * 1. Body (refreshToken) - Comum em SPAs (React/Vue).
       * 2. Header (Authorization Bearer) - Padrão Mobile/APIs.
       * 3. Cookie (refresh_token) - Abordagem Web segura.
       */
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // Prioridade: Body (SPA) > Header (Mobile/API) > Cookie (Web Legacy)
          // Isso cobre todos os cenários de clientes modernos
          let token = request?.body?.refreshToken;
          if (!token) token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
          if (!token) token = request?.cookies?.refresh_token;
          return token;
        },
      ]),
      secretOrKey: secret,
      passReqToCallback: true, // Permite que o objeto 'req' seja passado ao método validate
      ignoreExpiration: false, // Rejeita tokens expirados automaticamente
    });
  }

  /**
   * Valida o payload decodificado pelo Passport e anexa o token bruto ao resultado.
   * * Este método é chamado apenas se a assinatura e a expiração do JWT forem válidas.
   * O objeto retornado aqui será injetado no objeto da requisição como `req.user`.
   * * @param req - Objeto da requisição Express.
   * @param payload - Dados decodificados do JWT.
   * @returns Um objeto contendo os dados do usuário e o token bruto para validação posterior no banco de dados.
   * @throws ForbiddenException se o token não puder ser extraído manualmente da requisição.
   */
  validate(req: Request, payload: RefreshTokenPayload) {
    // Extração manual para obter a string do token necessária para comparação de hash no DB
    const refreshToken =
      req.body?.refreshToken ||
      req.get('Authorization')?.replace('Bearer', '').trim() ||
      req.cookies?.refresh_token;

    if (!refreshToken) {
      this.logger.warn(`Refresh Token ausente no request de ${payload.email}`);
      throw new ForbiddenException('Refresh token malformado');
    }

    // Retorna o objeto que será injetado em req.user
    // O AuthService.refreshTokens usará isso
    return {
      ...payload,
      refreshToken,
    };
  }
}
