/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { AuthResponse, JwtPayload, UserProfile, UserTokens } from './types';

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

  async signUp(createUserDto: CreateUserDto, requestingUser?: UserProfile): Promise<AuthResponse> {
    const { email, password, name, companyId, role, phone, document } = createUserDto;

    // 🔥 VALIDAÇÃO DO companyId
    if (!companyId || companyId.trim() === '') {
      throw new BadRequestException('ID da empresa é obrigatório');
    }

    // 🔥 VALIDAR FORMATO DO UUID (opcional, mas recomendado)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(companyId)) {
      throw new BadRequestException('ID da empresa deve ser um UUID válido');
    }

    // VERIFICAÇÃO DE PERMISSÃO - apenas MASTER ou ADMIN podem criar usuários
    if (requestingUser && !['MASTER', 'ADMIN'].includes(requestingUser.role)) {
      throw new UnauthorizedException('Você não tem permissão para criar usuários. Apenas MASTER e ADMIN podem realizar esta ação.');
    }

    // Se não houver requestingUser (registro público), também bloqueia
    if (!requestingUser) {
      throw new UnauthorizedException('Autenticação necessária para criar usuários.');
    }

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

      // 🔥 CORREÇÃO: Verificar se documento já existe (se fornecido)
      if (document) {
        const existingDocument = await this.prisma.user.findUnique({
          where: { document },
        });

        if (existingDocument) {
          throw new ConflictException('Já existe um usuário com este documento');
        }
      }

      // 🔥 REMOVIDO: Hash da senha - agora salva em texto puro
      // const hashedPassword = await bcrypt.hash(password, 12);

      // 🔥 CORREÇÃO: Criar usuário com campos atualizados do schema
      const user = await this.prisma.user.create({
        data: {
          email,
          password: password, // 🔥 AGORA: Senha em texto puro
          name,
          document: document || null,
          phone: phone || 'Não informado',
          companyId,
          role: (role as UserRole) || 'EMPLOYER',
          status: 'ATIVO',
          isProfessional: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          companyId: true,
          document: true,
          phone: true,
          createdAt: true,
        },
      });

      // Gerar tokens
      const tokens = await this.generateTokens(user as UserProfile);

      return {
        user,
        ...tokens,
      };
    } catch (error) {
      const prismaError = error as PrismaError;

      if (prismaError.code === 'P2023') {
        throw new BadRequestException('ID da empresa inválido');
      }
      if (prismaError.code === 'P2003') {
        throw new BadRequestException('Empresa não encontrada');
      }
      if (prismaError.code === 'P2002') {
        // Erro de constraint única - agora com tipagem segura
        const target = prismaError.meta?.target;
        if (target && Array.isArray(target)) {
          if (target.includes('documento')) {
            throw new ConflictException('Já existe um usuário com este documento');
          }
          if (target.includes('email')) {
            throw new ConflictException('Usuário com este email já existe');
          }
        }
        throw new ConflictException('Dados duplicados');
      }
      throw error;
    }
  }

  async login(loginUserDto: LoginUserDto): Promise<AuthResponse> {
    const { email, password } = loginUserDto;

    console.log('🔐 [BACKEND] Login attempt for:', email);
    console.log('📝 [BACKEND] Password received length:', password?.length);

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

    console.log('👤 [BACKEND] User found:', {
      exists: !!user,
      id: user?.id,
      email: user?.email,
      status: user?.status,
      password: user ? `${user.password.substring(0, 20)}...` : 'N/A',
      company: user?.company
    });

    if (!user) {
      console.log('❌ [BACKEND] User not found with email:', email);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // 🔥 CORREÇÃO: Verificar status atualizado
    console.log('📊 [BACKEND] User status:', user.status);
    if (user.status !== 'ATIVO') {
      console.log('❌ [BACKEND] User is not active. Status:', user.status);
      throw new UnauthorizedException('Usuário inativo');
    }

    // 🔥 ATUALIZADO: Comparação direta de senha (sem bcrypt)
    console.log('🔑 [BACKEND] Comparing passwords directly...');
    const isPasswordValid = password === user.password; // 🔥 COMPARAÇÃO DIRETA
    console.log('✅ [BACKEND] Password valid:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('❌ [BACKEND] Password comparison failed');
      console.log('🔍 [BACKEND] Input password:', password);
      console.log('🔍 [BACKEND] Stored password:', user.password);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    console.log('🎉 [BACKEND] Login successful for user:', user.email);

    // Gerar tokens
    const tokens = await this.generateTokens(user as UserProfile);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        companyId: user.companyId,
        document: user.document,
        phone: user.phone,
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
          document: true,
          phone: true,
        },
      });

      // 🔥 CORREÇÃO: Verificar status atualizado
      if (!user || user.status !== 'ATIVO') {
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
          document: true,
          phone: true,
        },
      });

      // 🔥 CORREÇÃO: Verificar status atualizado
      if (!user || user.status !== 'ATIVO') {
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
          document: user.document,
          phone: user.phone,
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
        document: true,
        phone: true,
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
        document: true,
        phone: true,
      },
    });

    // 🔥 CORREÇÃO: Verificar status atualizado
    if (!user || user.status !== 'ATIVO') {
      return null;
    }

    return user;
  }

  // Serviços de company

  async getCompanies() {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        status: true,
      },
      // 🔥 CORREÇÃO: Status atualizado
      where: {
        status: 'ATIVO'
      },
      take: 10
    });

    return companies;
  }

  async getCompaniesForMaster() {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        cnpj: true,
        telefone: true,
      },
      // 🔥 CORREÇÃO: Status atualizado
      where: {
        status: 'ATIVO'
      },
      orderBy: { name: 'asc' }
    });

    return companies;
  }

  async getProfessionals(companyId: string) {
    return this.prisma.user.findMany({
      where: {
        companyId,
        // 🔥 CORREÇÃO: Status atualizado
        status: 'ATIVO',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        document: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  // 🔥 NOVO: Método para buscar usuário por documento (útil para login alternativo)
  async findByDocument(document: string): Promise<UserProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { document },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        companyId: true,
        document: true,
        phone: true,
        company: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!user || user.status !== 'ATIVO') {
      return null;
    }

    return user;
  }
}