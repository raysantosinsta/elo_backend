/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards
} from '@nestjs/common';
import { Public } from 'src/chat/public.decorator';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Rota protegida para criação de usuários por administradores
  @UseGuards(JwtAuthGuard)
  @Post('admin/signup')
  async adminSignUp(@Body() createUserDto: CreateUserDto, @Request() req) {
    // Verificar se o usuário tem permissão
    if (!req.user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Verificar se é MASTER ou ADMIN
    if (!['MASTER', 'ADMIN'].includes(req.user.role)) {
      throw new ForbiddenException(
        'Apenas usuários MASTER ou ADMIN podem criar usuários',
      );
    }

    return this.authService.signUp(createUserDto, req.user);
  }

  @Public()
  @Post('signup')
  async signUp(@Body() createUserDto: CreateUserDto) {
    // Para signup público (se necessário), sem usuário solicitante
    return this.authService.signUp(createUserDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body() body: { refreshToken: string }) {
    if (!body.refreshToken) {
      throw new BadRequestException('Refresh token é obrigatório');
    }
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Public()
  @Post('verify-token')
  async verifyToken(@Body() body: { token: string }) {
    if (!body.token) {
      throw new BadRequestException('Token é obrigatório');
    }
    return this.authService.verifyToken(body.token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('companies')
  async getCompanies(@Request() req) {
    // Verificar se o usuário tem permissão (MASTER ou ADMIN)
    if (!['MASTER', 'ADMIN'].includes(req.user.role)) {
      throw new ForbiddenException(
        'Apenas usuários MASTER ou ADMIN podem acessar esta lista',
      );
    }

    return this.authService.getCompanies();
  }

  @UseGuards(JwtAuthGuard)
  @Get('companies/master')
  async getCompaniesForMaster(@Request() req) {
    // Verificar se o usuário é MASTER
    if (req.user.role !== 'MASTER') {
      throw new ForbiddenException(
        'Apenas usuários MASTER podem acessar esta lista completa de empresas',
      );
    }

    return this.authService.getCompaniesForMaster();
  }

  @Public()
  @Get('professionals/:companyId')
  async getProfessionals(@Param('companyId') companyId: string) {
    if (!companyId) {
      throw new BadRequestException('ID da empresa é obrigatório');
    }
    return this.authService.getProfessionals(companyId);
  }

  // Nova rota para buscar usuário por documento
  @Public()
  @Get('document/:document')
  async findByDocument(@Param('document') document: string) {
    if (!document) {
      throw new BadRequestException('Documento é obrigatório');
    }
    
    const user = await this.authService.findByDocument(document);
    
    if (!user) {
      throw new ForbiddenException('Usuário não encontrado ou inativo');
    }
    
    return user;
  }

  // Nova rota para login por documento
  @Public()
  @Post('login/document')
  @HttpCode(HttpStatus.OK)
  async loginByDocument(@Body() body: { document: string; password: string }) {
    if (!body.document || !body.password) {
      throw new BadRequestException('Documento e senha são obrigatórios');
    }

    // Primeiro, buscar usuário pelo documento
    const user = await this.authService.findByDocument(body.document);
    
    if (!user) {
      throw new ForbiddenException('Credenciais inválidas');
    }

    // Depois, fazer login com email (já que o login atual usa email)
    const loginDto: LoginUserDto = {
      email: user.email,
      password: body.password,
    };

    return this.authService.login(loginDto);
  }
}