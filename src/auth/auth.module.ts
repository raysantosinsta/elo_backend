/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RefreshTokenStrategy } from './refresh-token.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaModule } from 'src/prisma/prisma.module'; 


/**
 * @module AuthModule
 * * @description
 * Módulo central de Autenticação e Autorização da aplicação.
 * Responsável por configurar as estratégias de segurança (Passport) e a emissão de tokens (JWT).
 * * **Configurações Principais:**
 * - **JWT:** Configurado com segredo via `process.env` e expiração curta (15m) para segurança.
 * - **Banco de Dados:** Importa `PrismaModule` para garantir o uso da conexão singleton.
 * - **Estratégias:** Implementa `JwtStrategy` (proteção de rotas) e `RefreshTokenStrategy` (renovação).
 * * @exports AuthService - Disponibiliza métodos de login e validação para outros módulos.
 * @exports JwtAuthGuard - Guardião padrão para rotas protegidas.
 * @exports JwtModule - Exportado para utilitários que necessitem decodificar tokens.
 */
@Module({
  imports: [
    PassportModule,
    PrismaModule, // garante que usamos a MESMA conexão de banco
    
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' }, // Ajustei para 15m  (segurança)
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
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