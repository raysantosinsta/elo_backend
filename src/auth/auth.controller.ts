/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import { Public } from 'src/chat/public.decorator';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
  ) { }

  // Nova rota protegida para criação de usuários por administradores
  @Post('admin/signup')
  async adminSignUp(@Body() createUserDto: CreateUserDto, @Request() req) {
    // Passa o usuário autenticado para o service
    return this.authService.signUp(createUserDto, req.user);
  }

  @Public() // 🔥 Marcar esta rota como pública
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Public() // 🔥 Marcar esta rota como pública
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body() body: { refreshToken: string }) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  @Public() // 🔥 Marcar esta rota como pública
  @Post('verify-token')
  async verifyToken(@Body() body: { token: string }) {
    const result = await this.authService.verifyToken(body.token);
    return result;
  }

  @UseGuards(JwtAuthGuard)  // ← ESSA LINHA É OBRIGATÓRIA
  @Get('profile')
  async getProfile(@Request() req: any) {
    console.log('req.user no profile:', req.user); // agora vai aparecer!
    return this.authService.getProfile(req.user.sub);
  }

  // 🔥 NOVA ROTA: EMPRESAS PARA MASTER (PROTEGIDA - apenas MASTER pode acessar)
  @Get('companies/master')
  async getCompaniesForMaster(@Request() req) {
    // Verificar se o usuário é MASTER
    if (req.user.role !== 'MASTER') {
      throw new UnauthorizedException('Apenas usuários MASTER podem acessar esta lista de empresas');
    }

    return this.authService.getCompaniesForMaster();
  }

  @Public() // 🔥 Marcar esta rota como pública
  @Get('professionals/:companyId')
  async getProfessionals(@Param('companyId') companyId: string) {
    return this.authService.getProfessionals(companyId);
  }

  // ✅ NOVA ROTA: SOFT DELETE DE USUÁRIO
  // @Delete('users/:id')
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(JwtAuthGuard)
  // async softDeleteUser(
  //   @Param('id') userId: string,
  //   @Request() req: any, // ✅ Use @Request() em vez de @Req()
  // ) {
  //   return this.authService.softDeleteUser(userId, req.user);
  // }



  // 🔥 ROTA PÚBLICA PARA LISTAR EMPRESAS (qualquer um pode ver)
  // @Get('companies')
  // async getCompanies() {
  //   return this.authService.getCompanies();
  // }

  // 🔥 ROTA DE SIGNUP PÚBLICA (se necessário)
  // @Post('signup')
  // async signUp(@Body() createUserDto: CreateUserDto) {
  //   return this.authService.signUp(createUserDto);
  // }
}