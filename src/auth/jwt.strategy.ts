/* eslint-disable prettier/prettier */
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

// Payload que vem do token
interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  companyId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET não está definido nas variáveis de ambiente');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      // Opcional: rejeita token expirado automaticamente (recomendado)
      // já é o padrão com ignoreExpiration: false
    });
  }

  // ← ESSA É A PARTE QUE ESTAVA CAUSANDO O ERRO 500!
  async validate(payload: JwtPayload) {
    // Valida se o usuário ainda existe e está ativo
    const user = await this.authService.validateUser(payload);

    if (!user) {
      throw new UnauthorizedException('Token inválido ou usuário inativo');
    }

    // O que retornar aqui vira req.user no controller!
    return {
      sub: user.id,          // ← OBRIGATÓRIO: tem que ter o sub (id)
      id: user.id,           // alguns gostam de ter os dois
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      status: user.status,
    };
  }
}