/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  Request,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
  ) { } // 🔥 REMOVIDO: JwtService não é necessário no controller

  // Nova rota protegida para criação de usuários por administradores
  @Post('admin/signup')
  @UseGuards(JwtAuthGuard)
  async adminSignUp(@Body() createUserDto: CreateUserDto, @Request() req) {
    // Passa o usuário autenticado para o service
    return this.authService.signUp(createUserDto, req.user);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body() body: { refreshToken: string }) {
    // 🔥 CORREÇÃO: Removido UseGuards temporariamente ou ajuste sua estratégia
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('verify-token')
  async verifyToken(@Body() body: { token: string }) {
    const result = await this.authService.verifyToken(body.token);
    return result;
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard) // 🔥 CORREÇÃO: Usar JwtAuthGuard em vez de AuthGuard('jwt')
  async getProfile(@Request() req) {
    console.log('🔍 [CONTROLLER] req.user:', req.user);
    return this.authService.getProfile(req.user.sub);
  }

  // 🔥 NOVA ROTA: EMPRESAS PARA MASTER (PROTEGIDA - apenas MASTER pode acessar)
  @Get('companies/master')
  @UseGuards(JwtAuthGuard)
  async getCompaniesForMaster(@Request() req) {
    // Verificar se o usuário é MASTER
    if (req.user.role !== 'MASTER') {
      throw new UnauthorizedException('Apenas usuários MASTER podem acessar esta lista de empresas');
    }

    return this.authService.getCompaniesForMaster();
  }

  @Get('professionals/:companyId')
  async getProfessionals(@Param('companyId') companyId: string) {
    return this.authService.getProfessionals(companyId);
  }

  // 🔥 ROTA PÚBLICA PARA LISTAR EMPRESAS (qualquer um pode ver)
  @Get('companies')
  async getCompanies() {
    return this.authService.getCompanies();
  }

  // 🔥 ROTA DE SIGNUP PÚBLICA (se necessário)
  // @Post('signup')
  // async signUp(@Body() createUserDto: CreateUserDto) {
  //   return this.authService.signUp(createUserDto);
  // }
}