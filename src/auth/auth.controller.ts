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
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) { }

  @Post('signup')
  async signUp(@Body() createUserDto: CreateUserDto) {
    return this.authService.signUp(createUserDto);
  }

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
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body() body: { refreshToken: string }) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Post('verify-token')
  async verifyToken(@Body() body: { token: string }) {
    const result = await this.authService.verifyToken(body.token);
    return result;
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Request() req) {
    console.log('req.user completo:', req.user); // ← adicione essa linha
    return this.authService.getProfile(req.user.sub);
  }

  // 🔥 ROTA PÚBLICA PARA LISTAR EMPRESAS (qualquer um pode ver)
  @Get('companies')
  async getCompanies() {
    return this.authService.getCompanies();
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
}
