/* eslint-disable prettier/prettier */
// auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CacheModule } from '@nestjs/cache-manager'; // Já adicionado no passo anterior
import { ThrottlerModule } from '@nestjs/throttler'; // <--- 1. Importe isso

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenStrategy } from './refresh-token.strategy';

@Module({
  imports: [
    PassportModule,
    // Configuração do Cache (que você já corrigiu)
    CacheModule.register({
        ttl: 300000, 
        max: 100, 
    }),
    
    // 2. Adicione a configuração do Throttler (Rate Limit)
    ThrottlerModule.forRoot([{
      ttl: 60000, // Janela de tempo: 60 segundos (1 minuto)
      limit: 100, // Limite padrão seguro: 100 requisições por minuto (os decorators no controller sobrescrevem isso)
    }]),

    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '30m' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PrismaService,
    JwtAuthGuard,
    RefreshTokenStrategy
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule { }