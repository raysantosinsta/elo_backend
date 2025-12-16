/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoginUserDto } from './dto/login-user.dto';
import { AuthResponse, JwtPayload, UserProfile, UserTokens } from './types';



@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  
  // Constantes de negócio
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutos

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  // --- Auxiliares Privados ---

  private getTraceId(): string {
    // Idealmente viria de um AsyncLocalStorage (ClsService), gerando um novo aqui por simplicidade
    return randomUUID();
  }

  private mapToUserProfile(user: any): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      companyId: user.companyId,
      document: user.document || null,
      contact: user.phone || 'Não informado',
      // isProfessional: user.isProfessional || false,
      professionalRole: user.professionalRole || null,
      company: user.company || null,
      createdAt: user.createdAt,
    };
  }
 

  async login(loginUserDto: LoginUserDto): Promise<AuthResponse> {
    const traceId = this.getTraceId();
    const start = performance.now();

    const { email, password } = loginUserDto;

    // Segurança: Busca usuário mas não revela se existe ou não nos erros iniciais
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        company: { select: { id: true, name: true, status: true } },
      },
    });

    // Timing Attack Protection: Sempre executar o compare, mesmo se user for null (usando hash fake se necessário),
    // mas para simplicidade aqui, vamos apenas falhar rápido se não ativo.
    if (!user || user.status !== UserStatus.ACTIVE) {
      this.logger.warn({ traceId, message: 'Login falhou: Usuário não encontrado ou inativo', email });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      this.logger.warn({ traceId, message: 'Login falhou: Senha incorreta', userId: user.id });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const userProfile = this.mapToUserProfile(user);
    const tokens = await this.generateTokens(userProfile);

    // Performance: Aquecer o cache no login
    const cacheKey = `user_profile:${user.id}`;
    await this.cacheManager.set(cacheKey, userProfile, this.CACHE_TTL_SECONDS * 1000);

    this.logger.log({ 
      traceId, 
      method: 'login', 
      duration: performance.now() - start, 
      userId: user.id 
    });

    return { user: userProfile, ...tokens };
  }

  // --- Otimização de Custo e Performance (Cache) ---
  
  async verifyToken(token: string): Promise<{ valid: boolean; user?: UserProfile }> {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new InternalServerErrorException('JWT_SECRET não configurado');

      const payload: JwtPayload = this.jwtService.verify(token, { secret });
      const cacheKey = `user_profile:${payload.sub}`;

      // 1. Tentar Cache (Rápido e Barato)
      const cachedUser = await this.cacheManager.get<UserProfile>(cacheKey);
      if (cachedUser) {
        return { valid: true, user: cachedUser };
      }

      // 2. Fallback para Banco de Dados (Lento e Caro)
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          company: { select: { id: true, name: true, status: true } },
        },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        return { valid: false };
      }

      const userProfile = this.mapToUserProfile(user);

      // 3. Salvar no Cache
      await this.cacheManager.set(cacheKey, userProfile, this.CACHE_TTL_SECONDS * 1000);

      return { valid: true, user: userProfile };
    } catch (error) {
      // Token expirado ou inválido não é erro de sistema, é fluxo normal
      return { valid: false };
    }
  }

  async refreshTokens(refreshToken: string): Promise<UserTokens> {
    try {
      const secret = process.env.JWT_REFRESH_SECRET;
      if(!secret) throw new InternalServerErrorException("JWT_REFRESH_SECRET missing");

      const payload: JwtPayload = this.jwtService.verify(refreshToken, { secret });
      
      // Aqui precisamos bater no banco para garantir que o user não foi bloqueado no meio tempo
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        // Select otimizado
        select: { id: true, email: true, role: true, companyId: true, status: true, name: true } 
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Acesso revogado');
      }
      
      // Mapeamento simplificado pois o select foi parcial para performance
      // Nota: Em produção real, recarregaria dados completos ou ajustaria o UserProfile
      const partialProfile = { ...user } as any; 

      return this.generateTokens(partialProfile);
    } catch (e) {
      throw new UnauthorizedException('Sessão expirada, faça login novamente');
    }
  }

  // --- Métodos de Leitura com Cache Opcional ---

  async getProfile(userId: string): Promise<UserProfile> {
    const cacheKey = `user_profile:${userId}`;
    const cached = await this.cacheManager.get<UserProfile>(cacheKey);
    if(cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: { select: { id: true, name: true, status: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    
    const profile = this.mapToUserProfile(user);
    await this.cacheManager.set(cacheKey, profile, this.CACHE_TTL_SECONDS * 1000);
    
    return profile;
  }

  // --- Infraestrutura e Helpers ---

  private async generateTokens(user: UserProfile): Promise<UserTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m', // Access Token curto (Segurança)
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d', // Refresh Token longo
      }),
    ]);

    return { accessToken, refreshToken };
  }

}