/* eslint-disable prettier/prettier */
// auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
// REMOVIDO: CacheModule (Já é global no AppModule)
// REMOVIDO: ThrottlerModule (Vamos mover pro AppModule para proteger tudo)

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RefreshTokenStrategy } from './refresh-token.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

// IMPORTANTE: Importe o Módulo, não o Service direto
import { PrismaModule } from 'src/prisma/prisma.module'; 

@Module({
  imports: [
    PassportModule,
    PrismaModule, // <--- Importando o módulo garante que usamos a MESMA conexão de banco
    
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' }, // Ajustei para 15m conforme seu código anterior (segurança)
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RefreshTokenStrategy
    // REMOVIDO: PrismaService (Já vem do PrismaModule)
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule { }