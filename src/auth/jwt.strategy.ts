/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ExtractJwt, Strategy } from 'passport-jwt'; // Remova StrategyOptions daqui se não for usar mais
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UserRole, UserStatus } from '@prisma/client';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.access_token || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
      algorithms: ['HS256'],
      // passReqToCallback: false, // Opcional: O padrão já é false, não precisa por
    }); // <--- AQUI: Removi o "as StrategyOptions"
  }

  async validate(payload: JwtPayload) {
    // ... sua lógica continua igual ...
    const userProfile = await this.authService.getProfile(payload.sub);

    if (!userProfile) {
      throw new UnauthorizedException('Credenciais revogadas.');
    }

    if (userProfile.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Sua conta está inativa.');
    }

    if (userProfile.role !== payload.role) {
      throw new UnauthorizedException('Permissões alteradas. Faça login novamente.');
    }

    return {
      id: userProfile.id,
      email: userProfile.email,
      name: userProfile.name,
      role: userProfile.role,
      companyId: userProfile.companyId,
      status: userProfile.status,
    };
  }
}