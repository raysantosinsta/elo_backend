/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Public } from 'src/auth/public.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { AuthService } from './auth.service';
import { RefreshTokenDto, VerifyTokenDto } from './dto/auth-payloads.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshAuthGuard } from './refresh-auth.guard';

// Interface para tipagem do Request autenticado
interface RequestWithUser {
  user: {
    id: string;
    role: UserRole;
    email: string;
    [key: string]: any;
  };
}

@Controller('auth')
// Governança: Aplica Guards na ordem correta:
// 1. Throttler (Rate Limit) -> Protege contra ataques
// 2. JwtAuth (Autenticação) -> Garante quem é o usuário
// 3. Roles (Autorização) -> Garante o que ele pode fazer
@UseGuards(ThrottlerGuard, JwtAuthGuard, RolesGuard) 
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}


  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Resiliência: Proteção contra Brute Force
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginUserDto: LoginUserDto) {
    const start = performance.now();
    try {
      const result = await this.authService.login(loginUserDto);
      
      this.logger.log({
        action: 'login_success',
        email: loginUserDto.email,
        duration: `${(performance.now() - start).toFixed(2)}ms`
      });
      
      return result;
    } catch (error) {
      this.logger.warn(`Login falha: ${loginUserDto.email} - ${error.message}`);
      throw error;
    }
  }

  // --- GESTÃO DE SESSÃO (Tokens) ---

  @Public()
  @UseGuards(RefreshAuthGuard) // Usa especificamente o Guard de Refresh
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Public()
  @Post('verify-token')
  @HttpCode(HttpStatus.OK)
  async verifyToken(@Body() dto: VerifyTokenDto) {
    return this.authService.verifyToken(dto.token);
  }

  // --- PERFIL ---

  @Get('profile')
  async getProfile(@Request() req: RequestWithUser) {
    return this.authService.getProfile(req.user.id);
  }
}