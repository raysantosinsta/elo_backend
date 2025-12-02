/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto'; 
import { UserRole, UserStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { MentionUserResponseDto } from './dto/mention-user-response.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  private toResponseDto(user: any): UserResponseDto {
    const { password, ...userWithoutPassword } = user;
    return new UserResponseDto(userWithoutPassword);
  }

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Verificar se email já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email já está em uso');
    }

    // Verificar se documento já existe (se fornecido)
    if (createUserDto.document) {
      const existingDocument = await this.prisma.user.findUnique({
        where: { document: createUserDto.document },
      });

      if (existingDocument) {
        throw new ConflictException('Documento já está em uso');
      }
    }

    // Verificar companyId se fornecido
    if (createUserDto.companyId) {
      const companyExists = await this.prisma.company.findUnique({
        where: { id: createUserDto.companyId },
      });

      if (!companyExists) {
        throw new BadRequestException('Empresa não encontrada');
      }
    }

    // Hash da senha
    const hashedPassword = await this.hashPassword(createUserDto.password);

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        // CORREÇÃO: Usar UserStatus.ACTIVE (em inglês conforme schema)
        status: createUserDto.status || UserStatus.ACTIVE,
        isProfessional: createUserDto.isProfessional || false,
      },
    });

    return this.toResponseDto(user);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    companyId?: string,
    status?: UserStatus,
    role?: UserRole,
  ): Promise<{
    data: UserResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    // CORREÇÃO: Construir where considerando que companyId pode ser null
    const where: Prisma.UserWhereInput = {};
    
    if (companyId) {
      if (companyId === 'null' || companyId === 'undefined') {
        where.companyId = null;
      } else {
        // Validar se é um UUID válido
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(companyId)) {
          where.companyId = companyId;
        } else {
          throw new BadRequestException('ID da empresa inválido');
        }
      }
    }
    
    if (status) {
      where.status = status;
    }
    
    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(user => this.toResponseDto(user)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    return this.toResponseDto(user);
  }

  async findByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    return user ? this.toResponseDto(user) : null;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    // Verificar se usuário existe
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    // Verificar se email já está em uso por outro usuário
    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (emailExists) {
        throw new ConflictException('Email já está em uso');
      }
    }

    // Verificar se documento já está em uso por outro usuário
    if (updateUserDto.document && updateUserDto.document !== existingUser.document) {
      const documentExists = await this.prisma.user.findUnique({
        where: { document: updateUserDto.document },
      });

      if (documentExists) {
        throw new ConflictException('Documento já está em uso');
      }
    }

    // Verificar companyId se fornecido
    if (updateUserDto.companyId && updateUserDto.companyId !== existingUser.companyId) {
      if (updateUserDto.companyId === 'null' || updateUserDto.companyId === 'undefined') { // @ts-ignore
        updateUserDto.companyId = null;
      } else {
        const companyExists = await this.prisma.company.findUnique({
          where: { id: updateUserDto.companyId },
        });

        if (!companyExists) {
          throw new BadRequestException('Empresa não encontrada');
        }
      }
    }

    // Hash da senha se for fornecida
    let updateData = { ...updateUserDto };
    if (updateUserDto.password) {
      updateData.password = await this.hashPassword(updateUserDto.password);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return this.toResponseDto(user);
  }

  async remove(id: string): Promise<void> {
    // Verificar se usuário existe
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    await this.prisma.user.delete({
      where: { id },
    });
  }

  async deactivate(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    // CORREÇÃO: Usar UserStatus.INACTIVE (em inglês conforme schema)
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.INACTIVE },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return this.toResponseDto(updatedUser);
  }

  async activate(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    // CORREÇÃO: Usar UserStatus.ACTIVE (em inglês conforme schema)
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return this.toResponseDto(updatedUser);
  }

  async findByCompany(companyId: string, includeWithoutCompany: boolean = false): Promise<UserResponseDto[]> {
    // CORREÇÃO: Permitir buscar usuários sem empresa também
    const where: Prisma.UserWhereInput = {};
    
    if (companyId === 'null' || companyId === 'undefined') {
      where.companyId = null;
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(companyId)) {
        throw new BadRequestException('ID da empresa inválido');
      }
      
      if (includeWithoutCompany) {
        where.OR = [
          { companyId },
          { companyId: null }
        ];
      } else {
        where.companyId = companyId;
      }
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return users.map(user => this.toResponseDto(user));
  }

  async findByRole(role: UserRole): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: { role },
      orderBy: { name: 'asc' },
    });

    return users.map(user => this.toResponseDto(user));
  }
  
  async searchUsers(query: string, companyId?: string): Promise<MentionUserResponseDto[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const cleanQuery = query.trim().toLowerCase();

    try {
      const where: Prisma.UserWhereInput = {
        OR: [
          { name: { contains: cleanQuery, mode: 'insensitive' } },
          { email: { contains: cleanQuery, mode: 'insensitive' } },
        ],
        isProfessional: true,
        // CORREÇÃO: Usar UserStatus.ACTIVE (em inglês conforme schema)
        status: UserStatus.ACTIVE,
      };

      // CORREÇÃO: Tratar companyId corretamente (pode ser null ou string)
      if (companyId) {
        if (companyId === 'null' || companyId === 'undefined') {
          where.companyId = null;
        } else {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(companyId)) {
            where.companyId = companyId;
          } else {
            // Se não for um UUID válido, não aplicar filtro
            console.warn('CompanyId inválido para busca:', companyId);
          }
        }
      }

      const users = await this.prisma.user.findMany({
        where,
        orderBy: [
          { name: 'asc' },
          { professionalRole: 'asc' },
        ],
        take: 8,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          professionalRole: true,
          isProfessional: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      
      return users.map(u => new MentionUserResponseDto({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        professionalRole: u.professionalRole ?? undefined,
        isProfessional: u.isProfessional,
        company: u.company ? {
          id: u.company.id,
          name: u.company.name,
        } : undefined,
      }));
    } catch (error) {
      console.error('Erro no searchUsers:', error);
      return [];
    }
  }
}