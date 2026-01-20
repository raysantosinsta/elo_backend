/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ExtractJwt, Strategy } from 'passport-jwt'; 
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UserRole, SimpleStatus } from '@prisma/client';
import { Request } from 'express';

/**
 * Interface que define o formato dos dados (Claims) contidos dentro do JSON Web Token.
 * * @description
 * Esses dados são assinados criptograficamente pelo servidor.
 * - `sub`: Subject (ID do usuário). Padrão RFC 7519.
 * - `role`: Permissões do usuário no momento da criação do token.
 * - `companyId`: Tenant atual do usuário.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

/**
 * Estratégia de Autenticação JWT (Passport Strategy).
 * * @description
 * Esta classe é o coração da segurança da API. Ela é invocada automaticamente pelo `JwtAuthGuard`.
 * Sua função é interceptar cada requisição, extrair o token, verificar a assinatura
 * e validar se o usuário ainda tem permissão de acesso.
 * * @architecture
 * Utiliza uma abordagem híbrida de extração:
 * 1. Tenta ler o Header `Authorization: Bearer <token>` (Padrão API/Mobile).
 * 2. Se falhar, tenta ler o Cookie `access_token` (Padrão Web/SSR).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  
  /**
   * Configuração da Estratégia.
   * Define COMO o token deve ser lido e QUAL segredo usar para validar a assinatura.
   */
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    super({
      // Lógica de Extração: Prioriza o Header, fallback para Cookie.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => req?.cookies?.access_token || null,
      ]),
      // Segurança: Rejeita tokens expirados automaticamente (retorna 401).
      ignoreExpiration: false,
      // Segurança: Chave secreta para validar se o token não foi adulterado.
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
      algorithms: ['HS256'],
    }); 
  }

  /**
   * Validação de Regras de Negócio (Pós-Assinatura).
   * * @description
   * Este método roda SOMENTE se o token for válido (assinatura correta e não expirado).
   * Aqui aplicamos a segurança "Stateful" em um token "Stateless":
   * Consultamos o banco (ou cache) para garantir que o usuário não foi bloqueado ou teve permissões alteradas
   * DEPOIS que o token foi emitido.
   * * * @param {JwtPayload} payload - O conteúdo decodificado do token JSON.
   * @returns {Promise<any>} O objeto usuário que será injetado em `request.user`.
   */
  async validate(payload: JwtPayload) {
    // 1. Busca os dados mais recentes do usuário (Cache > Banco).
    // Isso garante que se o usuário mudar de nome ou empresa, o token antigo reflete os dados novos.
    const userProfile = await this.authService.getProfile(payload.sub);

    // 2. Check de Revogação Total: Usuário deletado ou não encontrado.
    if (!userProfile) {
      throw new UnauthorizedException('Credenciais revogadas.');
    }

    // 3. Check de Bloqueio Administrativo (Banimento).
    // Impede que um usuário demitido continue acessando o sistema até o token expirar (15min).
    if (userProfile.status !== SimpleStatus.ACTIVE) {
      throw new ForbiddenException('Sua conta está inativa.');
    }

    // 4. Check de Escalada de Privilégio (Role Mismatch).
    // Cenário: Usuário era 'USER', virou 'ADMIN', mas está usando um token velho de 'USER' (ou vice-versa).
    // Forçamos o login novamente para gerar um token com a Role correta.
    if (userProfile.role !== payload.role) {
      throw new UnauthorizedException('Permissões alteradas. Faça login novamente.');
    }

    // O retorno aqui é o que estará disponível em `req.user` nos Controllers.
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