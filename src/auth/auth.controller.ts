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
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

  @Post('signup')
  async signUp(@Body() createUserDto: CreateUserDto) {
    return this.authService.signUp(createUserDto);
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

  @Get('companies')
  async getCompanies() {
    return this.authService.getCompanies();
  }

  @Post('create-test-company')
  async createTestCompany() {
    const company = await this.authService.createTestCompany();
    return {
      message: 'Company de teste criada com sucesso',
      company,
    };
  }

  @Get('test-data')
  async getTestData() {
    const companies = await this.authService.getCompanies();
    return {
      companies,
      message:
        companies.length > 0
          ? 'Use um companyId acima para teste'
          : 'Nenhuma company encontrada. Execute o script de seed primeiro.',
    };
  }

  @Get('debug-token')
  async debugToken(@Request() req) {
    // O usuário já está disponível no req.user devido ao JwtAuthGuard
    return {
      userFromRequest: req.user,
      tokenPayload: this.jwtService.decode(
        req.headers.authorization.replace('Bearer ', ''),
      ),
    };
  }

  @Get('professionals/:companyId')
  async getProfessionals(@Param('companyId') companyId: string) {
    return this.authService.getProfessionals(companyId);
  }
}
