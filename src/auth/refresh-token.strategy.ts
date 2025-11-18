/* eslint-disable prettier/prettier */
// auth/refresh-token.strategy.ts
import { Strategy, ExtractJwt, StrategyOptionsWithRequest } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface RefreshTokenPayload {
  sub: string;
  email: string;
  // Add other payload properties as needed
}

interface ValidatedUser {
  userId: string;
  email: string;
  refreshToken: string;
}

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_REFRESH_SECRET');
    
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
    }

    const options: StrategyOptionsWithRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      passReqToCallback: true,
    };
    
    super(options);
  }

  validate(req: Request, payload: RefreshTokenPayload): ValidatedUser {
    const authHeader = req.get('Authorization');
    
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const refreshToken = authHeader.replace('Bearer', '').trim();
    
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      refreshToken,
    };
  }
}