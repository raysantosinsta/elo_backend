/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// CACHE_MANAGER: Token para injetar o sistema de cache (RAM).
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
// JwtService: Utilitário para criar e ler tokens JWT.
import { JwtService } from '@nestjs/jwt';
// Tipos do Banco de Dados (Prisma) e biblioteca de criptografia (bcrypt).
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { Cache } from 'cache-manager';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoginUserDto } from './dto/login-user.dto';
import { AuthResponse, JwtPayload, UserProfile, UserTokens } from './types';

/**
 * Responsável por toda a lógica de negócio de autenticação.
 * Aqui decidimos quem entra, quem é bloqueado e gerenciamos os tokens.
 */
@Injectable()
export class AuthService {
  // Cria um Logger específico para esta classe. Útil para debugar no terminal.
  // Ex: [AuthService] Login falhou...
  private readonly logger = new Logger(AuthService.name);

  // Constante que define que o Cache do perfil do usuário dura 5 minutos (300s).
  // Isso evita bater no banco de dados a cada requisição.
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutos

  constructor(
    private prisma: PrismaService, // Acesso ao Banco de Dados
    private jwtService: JwtService, // Ferramenta para gerenciamento de Tokens
    @Inject(CACHE_MANAGER) private cacheManager: Cache, // Ferramenta de Cache
  ) {}

  // --- Auxiliares Privados ---

  /**
   * Transforma o objeto bruto do Banco de Dados (que tem senha)
   * em um objeto limpo e seguro para devolver ao Frontend.
   */
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
      professionalRole: user.professionalRole || null,
      company: user.company || null,
      createdAt: user.createdAt,
    };
  }

  // --- Infraestrutura e Helpers ---

  /**
   * GENERATE TOKENS
   * Cria a dupla de chaves de acesso.
   */
  private async generateTokens(user: UserProfile): Promise<UserTokens> {
    // O Payload é o conteúdo JSON que vai "dentro" do token criptografado.
    const payload: JwtPayload = {
      sub: user.id, // Subject (ID do usuário)
      email: user.email,
      role: user.role, // Permissões
      companyId: user.companyId, // Empresa do usuário
    };

    // Promise.all executa as duas assinaturas em paralelo para otimizar tempo.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m', // Access Token: Vida curta para segurança. Se roubado, dura pouco.
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d', // Refresh Token: Vida longa para conveniência (Manter logado).
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * LOGIN
   * 1. Valida email e senha.
   * 2. Verifica se usuário está ativo.
   * 3. Gera tokens e salva perfil no cache para acessos futuros rápidos.
   */
  async login(loginUserDto: LoginUserDto): Promise<AuthResponse> {
    const { email, password } = loginUserDto;

    // Busca o usuário no banco pelo email.
    // O 'include' traz junto os dados da empresa (Join).
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        company: { select: { id: true, name: true, status: true } }, // em Multi-empresa quase tudo o que o usuário faz depende de qual empresa ele pertence
      },
    });

    // Hash falso para evitar timing attack (bcrypt válido) // Mesmo se o usuário não existir, faz a comparação da senha com um hash falso, para evitar ataques de timing ao descobrir usuários válidos.
    const fakeHash = '$2b$10$abcdefghijklmnopqrstuv';

    // Sempre compara a senha (usuário exista ou não)
    const passwordHashToCompare = user ? user.password : fakeHash;

    const isPasswordValid = await bcrypt.compare(
      password,
      passwordHashToCompare,
    ); // retorna true/false

    // Validação final: Usuário deve existir, estar ativo e senha deve ser válida.
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    } else if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Usuário Bloqueado');
    } else if (user.company && user.company.status !== 'ACTIVE') {
      throw new UnauthorizedException('Empresa Bloqueada');
    }
    // TODO: apos implmentar assinatura detalhar motivo de blqueio de usuarios / empresa
    this.logger.log({
      message: 'Login realizado com sucesso',
      userId: user.id,
    });

    // Mapeia perfil limpo
    const userProfile = this.mapToUserProfile(user);

    // Gera tokens
    const tokens = await this.generateTokens(userProfile);

    // Cache warming
    const cacheKey = `user_profile:${user.id}`;
    await this.cacheManager.set(
      cacheKey,
      userProfile,
      this.CACHE_TTL_SECONDS * 1000, // 5 minutos
    );

    // Retorno final
    return {
      user: userProfile,
      ...tokens,
    };
  }

  // --- Otimização de Custo e Performance (Cache) ---

  /**
   * Verifica se um token é válido e retorna os dados do usuário.
   */
  async verifyToken(
    token: string,
  ): Promise<{ valid: boolean; user?: UserProfile }> {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret)
        throw new InternalServerErrorException('JWT_SECRET não configurado');

      // 1. Verifica assinatura e expiração do token JWT
      const payload: JwtPayload = this.jwtService.verify(token, { secret });
      const cacheKey = `user_profile:${payload.sub}`;
      // TODO: para validar acho que nao precisa ir no banco de dados

      // 2. Tentar Cache
      // Pergunta: "Já tenho os dados desse usuário na memória?"
      const cachedUser = await this.cacheManager.get<UserProfile>(cacheKey);
      if (cachedUser) {
        return { valid: true, user: cachedUser };
      }

      // 3. Fallback para Banco de Dados
      // Se não estava no cache (ou expirou), busca no banco.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          company: { select: { id: true, name: true, status: true } },
        },
      });

      // Se usuário foi deletado ou inativado no banco, nega acesso.
      if (!user || user.status !== UserStatus.ACTIVE) {
        return { valid: false };
      }

      const userProfile = this.mapToUserProfile(user);

      // 4. Salvar no Cache (Renovação)
      // Guarda na memória de novo para as próximas requisições serem rápidas.
      await this.cacheManager.set(
        cacheKey,
        userProfile,
        this.CACHE_TTL_SECONDS * 1000, // 5 minutos
      );

      return { valid: true, user: userProfile };
    } catch (error) {
      this.logger.warn(`Token inválido: ${error.message}`);
      // Se o token expirou ou é falso, o jwtService.verify lança erro.
      // Capturamos aqui e retornamos valid: false para o frontend saber que precisa deslogar/refresh.
      return { valid: false };
    }
  }

  /**
   * REFRESH TOKENS
   * Usado quando o Access Token (15 min) expira.
   * O usuário envia o Refresh Token (7 dias) para ganhar mais tempo sem logar de novo.
   */
  async refreshTokens(refreshToken: string): Promise<UserTokens> {
    try {
      const secret = process.env.JWT_REFRESH_SECRET;
      if (!secret)
        throw new InternalServerErrorException('JWT_REFRESH_SECRET missing');

      // Verifica se o refresh token é válido
      const payload: JwtPayload = this.jwtService.verify(refreshToken, {
        secret,
      });

      // SEGURANÇA CRÍTICA:
      // Mesmo com token válido, precisamos ir no banco ver se o usuário NÃO foi bloqueado/demitido nesse meio tempo.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        // Select Otimizado: Trazemos APENAS os campos necessários para gerar o novo token.
        // Isso torna a query muito mais leve e rápida.
        select: {
          id: true,
          email: true,
          role: true,
          companyId: true,
          status: true,
          name: true,
        },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Acesso revogado');
      }

      // Hack técnico: Como usamos 'select' parcial, o TS reclama que não é um User completo.
      // Usamos 'as any' para forçar a criação dos tokens.
      const partialProfile = { ...user } as any; // select nao traz todos os campos, mas o generateTokens so precisa desses campos

      // Gera tokens novos e devolve ao usuário.
      return this.generateTokens(partialProfile);
    } catch (e) {
      // Se o refresh token também expirou (passou 7 dias), força login.
      throw new UnauthorizedException('Sessão expirada, faça login novamente');
    }
  }

  // --- Métodos de Leitura com Cache Opcional ---

  /**
   * Retorna os dados do usuário logado.
   * Também usa estratégia de Cache para ser instantâneo.
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const cacheKey = `user_profile:${userId}`;
    // Tenta pegar do cache primeiro
    const cached = await this.cacheManager.get<UserProfile>(cacheKey);
    if (cached) return cached;

    // Se não achar, vai no banco
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: { select: { id: true, name: true, status: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const profile = this.mapToUserProfile(user);
    // Salva no cache para a próxima vez
    await this.cacheManager.set(
      cacheKey,
      profile,
      this.CACHE_TTL_SECONDS * 1000, // 5 minutos
    );

    return profile;
  }
}
