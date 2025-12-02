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
  Res,
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

  // auth.controller.ts - método getCompaniesForMaster final
@UseGuards(JwtAuthGuard)
@Get('companies/master')
async getCompaniesForMaster(@Request() req, @Res() res: any) {
  try {
    console.log('🔍 [CONTROLLER] /companies/master chamado');
    
    if (!req.user) {
      console.log('❌ [CONTROLLER] req.user está undefined');
      return res.status(401).json({
        statusCode: 401,
        message: 'Usuário não autenticado',
      });
    }

    if (req.user.role !== 'MASTER') {
      console.log('❌ [CONTROLLER] Usuário não é MASTER. Role:', req.user.role);
      return res.status(403).json({
        statusCode: 403,
        message: 'Apenas usuários MASTER podem acessar esta lista de empresas',
      });
    }

    console.log('✅ [CONTROLLER] Usuário autorizado, buscando empresas...');
    
    const companies = await this.authService.getCompaniesForMaster();
    
    console.log(`📦 [CONTROLLER] Retornando ${companies.length} empresas`);
    
    // Retorna com status 200 e os dados
    return res.status(200).json(companies);
    
  } catch (error) {
    console.error('💥 [CONTROLLER] Erro ao buscar empresas:', error);
    
    return res.status(500).json({
      statusCode: 500,
      message: 'Erro interno ao buscar empresas',
      error: error.message,
    });
  }
}

  @Public() 
  @Get('professionals/:companyId')
  async getProfessionals(@Param('companyId') companyId: string) {
    return this.authService.getProfessionals(companyId);
  }
}