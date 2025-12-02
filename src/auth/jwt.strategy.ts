/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/auth/jwt.strategy.ts
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: any) => {
          // Tenta extrair do cookie
          let token = request?.cookies?.access_token || null;
          // Se não encontrar no cookie, tenta extrair do header Authorization
          if (!token && request.headers.authorization) {
            const authHeader = request.headers.authorization;
            if (authHeader.startsWith('Bearer ')) {
              token = authHeader.substring(7);
            }
          }
          console.log('🔑 [JWT STRATEGY] Token extraído:', token ? `${token.substring(0, 20)}...` : 'null');
          return token;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    };
    super(options);
  }

  async validate(payload: any) {
    console.log('🔑 [JWT STRATEGY] Payload recebido:', {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
      exp: payload.exp,
      iat: payload.iat,
    });

    try {
      // Primeiro, valida o usuário com o service
      const user = await this.authService.validateUser(payload);
      
      if (!user) {
        console.log('❌ [JWT STRATEGY] Usuário não encontrado ou inativo');
        throw new UnauthorizedException('Usuário inativo ou não encontrado');
      }

      console.log('✅ [JWT STRATEGY] Usuário validado:', {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        status: user.status,
      });

      // Retorna o usuário completo para o req.user
      return {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        status: user.status,
        document: user.document,
        phone: user.phone,
      };
    } catch (error) {
      console.error('💥 [JWT STRATEGY] Erro ao validar usuário:', error);
      
      // Se já é uma UnauthorizedException, re-lançar
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      // Para outros erros, lançar exceção genérica
      throw new UnauthorizedException('Falha na validação do token');
    }
  }
}