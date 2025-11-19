/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserProfile, JwtPayload, UserTokens, AuthResponse } from './types';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async signUp(createUserDto: CreateUserDto): Promise<AuthResponse> {
    const { email, password, name, companyId, role, contact } = createUserDto;

    try {
      // Verificar se a company existe
      const companyExists = await this.prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!companyExists) {
        throw new NotFoundException(`Empresa com ID ${companyId} não encontrada`);
      }

      // Verificar se usuário já existe
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new ConflictException('Usuário com este email já existe');
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 12);

      // Criar usuário
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          companyId,
          role: (role as UserRole) || 'USER',
          contact,
          isProfessional: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          companyId: true,
          createdAt: true,
        },
      });

      // Gerar tokens
      const tokens = await this.generateTokens(user);
      
      return {
        user,
        ...tokens,
      };
    } catch (error) {
      if (error.code === 'P2003') {
        throw new BadRequestException('Empresa não encontrada');
      }
      throw error;
    }
  }

  async login(loginUserDto: LoginUserDto): Promise<AuthResponse> {
    const { email, password } = loginUserDto;

    // Buscar usuário
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Verificar status
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Usuário inativo');
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Gerar tokens
    const tokens = await this.generateTokens(user);
    
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        companyId: user.companyId,
        company: user.company,
        createdAt: user.createdAt,
      },
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<UserTokens> {
    try {
      const payload: JwtPayload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          companyId: true,
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException();
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async verifyToken(token: string): Promise<{ valid: boolean; user?: UserProfile }> {
    try {
      const payload: JwtPayload = this.jwtService.verify(token);
      
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          companyId: true,
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        return { valid: false };
      }

      return {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          companyId: user.companyId,
        },
      };
    } catch {
      return { valid: false };
    }
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    return user;
  }

  private async generateTokens(user: UserProfile): Promise<UserTokens> {
    const payload: JwtPayload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      companyId: user.companyId 
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async validateUser(payload: JwtPayload): Promise<UserProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        companyId: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      return null;
    }

    return user;
  }

  // Método para criar company de teste
  async createTestCompany() {
    const company = await this.prisma.company.create({
      data: {
        name: `Empresa Teste ${Date.now()}`,
        cnpj: `12.345.678/0001-${Math.random().toString().substring(2, 6)}`,
        telefone: '(11) 9999-9999',
        email: `teste${Date.now()}@empresa.com`,
        endereco: 'Rua Teste, 123',
        numero: '123',
        bairro: 'Centro',
        cidade: 'São Paulo',
        estado: 'SP',
        cep: '01234-567',
        ramoAtividade: 'Tecnologia',
        status: 'ativo'
      },
    });

    return {
      id: company.id,
      name: company.name,
      email: company.email
    };
  }

  // Método para listar companies disponíveis
  async getCompanies() {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        status: true,
      },
      where: {
        status: 'ativo'
      },
      take: 10
    });

    return companies;
  }

  async getProfessionals(companyId: string) {
  return this.prisma.user.findMany({
    where: {
      companyId,
      status: 'ACTIVE',
      // Opcional: só quem pode ser responsável (ex: não admins bloqueados)
      // role: { in: ['USER', 'PROFESSIONAL', 'ADMIN'] }
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: { name: 'asc' },
  });
}
}