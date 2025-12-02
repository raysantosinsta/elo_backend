/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CompanyStatus, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { AuthResponse, JwtPayload, UserProfile, UserTokens } from './types';
import * as bcrypt from 'bcrypt';

interface PrismaError extends Error {
  code?: string;
  meta?: {
    target?: string[];
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  // Método auxiliar para mapear User do Prisma para UserProfile
  private mapToUserProfile(user: any): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      companyId: user.companyId,
      document: user.document || null,
      phone: user.phone || 'Não informado',
      isProfessional: user.isProfessional || false,
      professionalRole: user.professionalRole || null,
      company: user.company || null,
      createdAt: user.createdAt,
    };
  }

  async signUp(
    createUserDto: CreateUserDto,
    requestingUser?: UserProfile,
  ): Promise<AuthResponse> {
    const {
      email,
      password,
      name,
      companyId,
      role = 'EMPLOYER',
      phone,
      document,
      isProfessional = false,
      professionalRole,
    } = createUserDto;

    // Validação obrigatória de companyId
    if (!companyId) {
      throw new BadRequestException('ID da empresa é obrigatório');
    }

    // Validação de UUID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(companyId)) {
      throw new BadRequestException('ID da empresa deve ser um UUID válido');
    }

    // Para signup público, permitir sem requestingUser
    // Mas verificar se o role não é ADMIN ou MASTER (apenas esses podem ser criados por admins)
    if (!requestingUser && ['ADMIN', 'MASTER'].includes(role)) {
      throw new UnauthorizedException(
        'Apenas usuários ADMIN ou MASTER podem criar outros administradores',
      );
    }

    // Se tem requestingUser, verificar permissões
    if (requestingUser && !['MASTER', 'ADMIN'].includes(requestingUser.role)) {
      throw new UnauthorizedException(
        'Apenas MASTER ou ADMIN podem criar usuários',
      );
    }

    try {
      // Verificar se empresa existe e está ativa
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        throw new NotFoundException('Empresa não encontrada');
      }

      if (company.status !== CompanyStatus.ATIVO) {
        throw new BadRequestException('Empresa inativa');
      }

      // Verificar email único
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        throw new ConflictException('Email já cadastrado');
      }

      // Verificar documento único (se fornecido)
      if (document) {
        const existingDoc = await this.prisma.user.findUnique({
          where: { document },
        });
        if (existingDoc) {
          throw new ConflictException('Documento já cadastrado');
        }
      }

      // Hash da senha antes de salvar
      const hashedPassword = await bcrypt.hash(password, 10);

      // Criar usuário com campos corretos do schema
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword, // AGORA SALVA HASH
          name,
          document: document || null,
          phone: phone || 'Não informado',
          companyId,
          role: role as UserRole,
          status: UserStatus.ACTIVE,
          isProfessional,
          professionalRole: isProfessional ? professionalRole : null,
        },
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

      const userProfile = this.mapToUserProfile(user);
      const tokens = await this.generateTokens(userProfile);

      return {
        user: userProfile,
        ...tokens,
      };
    } catch (error) {
      this.handlePrismaError(error);
      throw error;
    }
  }

  async login(loginUserDto: LoginUserDto): Promise<AuthResponse> {
    const { email, password } = loginUserDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        company: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // CORREÇÃO: Usar bcrypt.compare para verificar senha hash
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const userProfile = this.mapToUserProfile(user);
    const tokens = await this.generateTokens(userProfile);

    return {
      user: userProfile,
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<UserTokens> {
    try {
      const payload: JwtPayload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
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

      // Verificar status atualizado
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Usuário inativo ou não encontrado');
      }

      return this.generateTokens(this.mapToUserProfile(user));
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async verifyToken(token: string): Promise<{ valid: boolean; user?: UserProfile }> {
    try {
      const payload: JwtPayload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'jwt-secret',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
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

      // Verificar status atualizado
      if (!user || user.status !== UserStatus.ACTIVE) {
        return { valid: false };
      }

      return {
        valid: true,
        user: this.mapToUserProfile(user),
      };
    } catch {
      return { valid: false };
    }
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
      throw new UnauthorizedException('Usuário não encontrado');
    }

    return this.mapToUserProfile(user);
  }

  private async generateTokens(user: UserProfile): Promise<UserTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET || 'jwt-secret',
        expiresIn: '30m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
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

    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    return this.mapToUserProfile(user);
  }

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
        status: 'ATIVO'
      },
      take: 10
    });

    return companies;
  }

  async getCompaniesForMaster() {
    return this.prisma.company.findMany({
      where: { status: CompanyStatus.ATIVO },
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        telefone: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getProfessionals(companyId: string) {
    const professionals = await this.prisma.user.findMany({
      where: {
        companyId,
        status: UserStatus.ACTIVE,
        isProfessional: true,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return professionals.map(prof => this.mapToUserProfile(prof));
  }

  async findByDocument(document: string): Promise<UserProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { document },
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

    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    return this.mapToUserProfile(user);
  }

  private handlePrismaError(error: any) {
    const prismaError = error as PrismaError;
    if (prismaError.code === 'P2002') {
      const field = prismaError.meta?.target?.[0];
      if (field === 'email') throw new ConflictException('Email já cadastrado');
      if (field === 'document') throw new ConflictException('Documento já cadastrado');
    }
    if (prismaError.code === 'P2025') {
      throw new NotFoundException('Recurso não encontrado');
    }
  }
}