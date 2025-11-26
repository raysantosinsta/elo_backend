/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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

    // Hash da senha
    const hashedPassword = await this.hashPassword(createUserDto.password);

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        status: createUserDto.status || UserStatus.ATIVO,
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
    
    const where = {
      ...(companyId && { companyId }),
      ...(status && { status }),
      ...(role && { role }),
    };

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

  // Hash da senha se for fornecida
  let updateData = { ...updateUserDto };
  if (updateUserDto.password) {
    updateData.password = await this.hashPassword(updateUserDto.password);
  }

  // 🔥 ATUALIZADO: Incluir company na resposta
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

  // 🔥 ATUALIZADO: Incluir company na resposta
  const updatedUser = await this.prisma.user.update({
    where: { id },
    data: { status: UserStatus.INATIVO },
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

  // 🔥 ATUALIZADO: Incluir company na resposta
  const updatedUser = await this.prisma.user.update({
    where: { id },
    data: { status: UserStatus.ATIVO },
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

  async findByCompany(companyId: string): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      where: { companyId },
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
  async searchUsers(query: string): Promise<UserResponseDto[]> {
  if (!query || query.trim() === "") return [];

  const users = await this.prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { name: 'asc' },
  });

  return users.map(u => this.toResponseDto(u));
}

}