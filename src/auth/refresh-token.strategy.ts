/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UserRole } from '@prisma/client';

// Tipagem alinhada com o JwtPayload
interface RefreshTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  private readonly logger = new Logger(RefreshTokenStrategy.name);

  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET missing');

    super({
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
      passReqToCallback: true, // Necessário para acessar o token bruto
      ignoreExpiration: false,
    });
  }

  validate(req: Request, payload: RefreshTokenPayload) {
    // Extração manual para garantir que temos o token string para comparar no banco (se necessário)
    // Nota: O passport já validou a assinatura e expiração antes de chegar aqui.
    
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