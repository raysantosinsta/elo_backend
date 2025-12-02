/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// auth/jwt.strategy.ts
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UserRole, UserStatus } from '@prisma/client';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

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
          if (!token && request.headers?.authorization) {
            const authHeader = request.headers.authorization;
            if (authHeader.startsWith('Bearer ')) {
              token = authHeader.substring(7);
            }
          }
          
          if (process.env.NODE_ENV !== 'production') {
            this.logger.debug(`🔑 [JWT STRATEGY] Token extraído: ${token ? 'Present' : 'Null'}`);
          }
          
          return token;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'], // Especifica o algoritmo para segurança
    };
    super(options);
  }

  async validate(payload: JwtPayload) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(`🔑 [JWT STRATEGY] Payload recebido:`, {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        companyId: payload.companyId,
      });
    }

    try {
      // Valida o payload básico
      if (!payload.sub || !payload.email || !payload.role) {
        this.logger.warn('❌ [JWT STRATEGY] Payload incompleto');
        throw new UnauthorizedException('Token inválido: payload incompleto');
      }

      // Verifica se o token está expirado
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        this.logger.warn('❌ [JWT STRATEGY] Token expirado');
        throw new UnauthorizedException('Token expirado');
      }

      // Valida o usuário com o service
      const user = await this.authService.validateUser(payload);
      
      if (!user) {
        this.logger.warn(`❌ [JWT STRATEGY] Usuário não encontrado ou inativo: ${payload.sub}`);
        throw new UnauthorizedException('Usuário inativo ou não encontrado');
      }

      // Verifica se o status do usuário é ativo
      if (user.status !== UserStatus.ACTIVE) {
        this.logger.warn(`❌ [JWT STRATEGY] Usuário inativo: ${user.id}`);
        throw new UnauthorizedException('Usuário inativo');
      }

      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`✅ [JWT STRATEGY] Usuário validado:`, {
          id: user.id,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          status: user.status,
        });
      }

      // Retorna o usuário com todas as propriedades necessárias
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
        isProfessional: user.isProfessional,
        professionalRole: user.professionalRole,
      };
    } catch (error) {
      this.logger.error(`💥 [JWT STRATEGY] Erro ao validar token: ${error.message}`, error.stack);
      
      // Se já é uma UnauthorizedException, re-lançar
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      // Para outros erros, lançar exceção genérica
      throw new UnauthorizedException('Falha na validação do token');
    }
  }
}