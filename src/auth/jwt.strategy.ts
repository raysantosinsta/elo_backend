/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UserRole, UserStatus } from '@prisma/client';
import { Request } from 'express';

// --- Interfaces para Tipagem Estrita ---
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  iat?: number;
  exp?: number;
}

interface ValidatedUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  status: UserStatus;
  // Campos adicionais úteis para o Request Context
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('FATAL: JWT_SECRET is not defined in environment variables');
    }

    const options: StrategyOptions = {
      // Estratégia de extração híbrida: Header -> Cookie
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => {
          // Extração segura de cookie
          const token = request?.cookies?.access_token;
          if (!token) return null;
          return token;
        },
      ]),
      ignoreExpiration: false, // Segurança: Nunca ignorar expiração
      secretOrKey: secret,
      algorithms: ['HS256'], // Segurança: Força algoritmo simétrico
      passReqToCallback: false, // Performance: Não precisamos do request no validate, simplifica
    };
    
    super(options);
  }

  /**
   * Validação do Token
   * Executado automaticamente pelo Guard após a assinatura do token ser verificada com sucesso.
   */
  async validate(payload: JwtPayload): Promise<ValidatedUser> {
    const start = performance.now();

    // 1. Validação de Schema do Payload (Fail Fast)
    if (!payload.sub || !payload.email || !payload.role) {
      this.logger.warn(`Payload malformado detectado: sub=${payload.sub}`);
      throw new UnauthorizedException('Token inválido: estrutura incorreta');
    }

    try {
      // 2. Performance: Validação com Cache via AuthService
      // O 'token' não está disponível aqui (apenas payload), então usamos o verifyToken com lógica interna ou cache manual
      // Como o verifyToken do service precisa da string do token (que o passport já validou a assinatura),
      // aqui focamos em validar se o usuário ainda existe e está ativo (usando o Cache do Service).
      
      // Chamamos um método otimizado que busca por ID (usando cache)
      const userProfile = await this.authService.getProfile(payload.sub);

      // 3. Validação de Regras de Negócio
      if (!userProfile) {
        this.logger.warn(`Usuário não encontrado para ID: ${payload.sub}`);
        throw new UnauthorizedException('Credenciais revogadas');
      }

      if (userProfile.status !== UserStatus.ACTIVE) {
        this.logger.warn(`Tentativa de acesso de usuário inativo: ${userProfile.email}`);
        throw new ForbiddenException('Conta inativa ou bloqueada');
      }

      // Validação de Consistência (Token vs Banco)
      // Se o role no token for diferente do banco, força re-login (elevação de privilégio ou downgrade)
      if (userProfile.role !== payload.role) {
        this.logger.warn(`Discrepância de Role detectada. Token: ${payload.role}, DB: ${userProfile.role}`);
        throw new UnauthorizedException('Permissões alteradas, faça login novamente');
      }

      const duration = performance.now() - start;
      if (duration > 50) { // Monitoramento de latência
         this.logger.log(`Validação lenta: ${duration.toFixed(2)}ms para user ${payload.sub}`);
      }

      // 4. Retorno do Objeto User para o Request
      return {
        id: userProfile.id,
        email: userProfile.email,
        name: userProfile.name,
        role: userProfile.role,
        companyId: userProfile.companyId,
        status: userProfile.status,
      };

    } catch (error) {
      // Logging seletivo para evitar ruído de 'Unauthorized' normais
      if (!(error instanceof UnauthorizedException) && !(error instanceof ForbiddenException)) {
        this.logger.error(`Erro inesperado na validação JWT: ${error.message}`, error.stack);
      }
      throw error;
    }
  }
}