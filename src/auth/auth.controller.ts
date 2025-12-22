/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from 'src/auth/public.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { AuthService } from './auth.service';
import { RefreshTokenDto, VerifyTokenDto } from './dto/auth-payloads.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshAuthGuard } from './refresh-auth.guard';
import type { RequestWithUser } from './types';

// Interface auxiliar para garantir que o TypeScript saiba que req.user existe


/**
 * Controller de Autenticação (Porta de Entrada)
 * * Responsável por receber as requisições HTTP de login, refresh e perfil.
 * * ARQUITETURA DE SEGURANÇA (Guards):
 * A ordem dentro do @UseGuards é crítica:
 * 1. ThrottlerGuard: Para o ataque AQUI. Se fizer spam, nem processa o resto.
 * 2. JwtAuthGuard: Verifica QUEM é o usuário (lê o token).
 * 3. RolesGuard: Verifica O QUE o usuário pode fazer (lê o cargo).
 */
@Controller('auth')
@UseGuards(ThrottlerGuard, JwtAuthGuard, RolesGuard)
export class AuthController {
 
  constructor(private readonly authService: AuthService) { }


  /**
   * Rota de Login (POST /auth/login)
   * * Objetivo: Trocar credenciais (email/senha) por Tokens (Access + Refresh).
   * Segurança: 
   * - @Public: Permite acesso sem token (obviamente, pois é o login).
   * - @Throttle: Limita a 10 tentativas por minuto para evitar Brute Force (tentar senhas até acertar).
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Resiliência: Proteção contra Brute Force
  @Post('login')
  @HttpCode(HttpStatus.OK) // Retorna 200 OK em vez de 201 Created (padrão do POST)
  async login(@Body() loginUserDto: LoginUserDto) {
    return await this.authService.login(loginUserDto);
  }

  // --- GESTÃO DE SESSÃO (Tokens) ---


  /**
   * Rota de Refresh Token (POST /auth/refresh)
   * * Objetivo: Obter um novo Access Token quando o antigo (15min) expirar.
   * Segurança:
   * - @Public: Ignora o JwtAuthGuard padrão (que exige access token).
   * - @UseGuards(RefreshAuthGuard): Usa um Guard especial que sabe ler o Refresh Token (7 dias).
   */
  @Public()
  @UseGuards(RefreshAuthGuard) // Usa especificamente o Guard de Refresh
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    // O RefreshAuthGuard já validou a assinatura do token antes de chegar aqui.
    // O Service vai verificar se o usuário ainda está ativo no banco.
    return this.authService.refreshTokens(dto.refreshToken);
  }


  /**
   * Rota de Verificação (POST /auth/verify-token)
  * * Objetivo: Verificar se um Access Token é válido (assinatura + expiração).
   * O Frontend chama isso para saber "Posso deixar o usuário entrar na página /dashboard?".
   * Retorna true/false.
   */
  @Public()
  @Post('verify-token')
  @HttpCode(HttpStatus.OK)
  async verifyToken(@Body() dto: VerifyTokenDto) {
    return this.authService.verifyToken(dto.token);
  }

  // --- PERFIL ---

  /**
   * Rota de Perfil (GET /auth/profile)
   * * Objetivo: Obter dados do usuário logado (ex: nome, empresa, foto).
   * Segurança:
   * - NÃO tem @Public: Logo, exige um Access Token válido no Header.
   * - O objeto `req.user` é preenchido automaticamente pelo JwtStrategy.
   */
  @Get('profile')
  async getProfile(@Request() req: RequestWithUser) {
    // Usa o ID extraído do token para buscar os dados frescos no banco/cache
    return this.authService.getProfile(req.user.id);
  }
}