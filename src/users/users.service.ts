/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { MentionUserResponseDto } from './dto/mention-user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  // --- Auxiliares Privados ---

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private toResponseDto(user: any): UserResponseDto {
    // Sanitização final para garantir que password nunca vaze
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return new UserResponseDto(userWithoutPassword);
  }

  // --- CRUD Operations ---

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const { email, document, companyId, password } = createUserDto;

    // Validações de Negócio (Check-First)
    const [existingEmail, existingDoc] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      document ? this.prisma.user.findUnique({ where: { document } }) : null,
    ]);

    if (existingEmail) throw new ConflictException('Email já está em uso');
    if (existingDoc) throw new ConflictException('Documento já está em uso');

    if (companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) throw new BadRequestException('Empresa não encontrada');
    }

    const hashedPassword = await this.hashPassword(password);

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        status: createUserDto.status || UserStatus.ACTIVE,
        isProfessional: createUserDto.isProfessional || false,
      },
    });

    this.logger.log(`Usuário criado: ${user.id} (${user.email})`);
    return this.toResponseDto(user);
  }

  async findAll(
    page = 1,
    limit = 10,
    companyId?: string,
    status?: UserStatus,
    role?: UserRole,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {};

    if (companyId) {
      where.companyId = companyId === 'null' ? null : companyId;
    }
    if (status) where.status = status;
    if (role) where.role = role;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { company: { select: { id: true, name: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => this.toResponseDto(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { company: { select: { id: true, name: true, email: true } } },
    });

    if (!user) throw new NotFoundException(`Usuário ${id} não encontrado`);
    return this.toResponseDto(user);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const existingUser = await this.prisma.user.findUnique({ where: { id } });
    if (!existingUser)
      throw new NotFoundException(`Usuário ${id} não encontrado`);

    // Validações de Unicidade apenas se os campos mudaram
    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });
      if (emailExists) throw new ConflictException('Email já em uso');
    }

    // Preparar dados de atualização
    const data: Prisma.UserUpdateInput = { ...updateUserDto };
    if (updateUserDto.password) {
      data.password = await this.hashPassword(updateUserDto.password);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data,
      include: { company: { select: { id: true, name: true } } },
    });

    this.logger.log(`Usuário atualizado: ${id}`);
    return this.toResponseDto(updatedUser);
  }

  async remove(id: string): Promise<void> {
    // Soft Delete preferível, mas mantendo hard delete conforme solicitado
    try {
      await this.prisma.user.delete({ where: { id } });
      this.logger.warn(`Usuário removido: ${id}`);
    } catch (error) {
      if ((error as any).code === 'P2025')
        throw new NotFoundException('Usuário não encontrado');
      throw error;
    }
  }

  // --- Features Específicas ---

  async toggleStatus(id: string, status: UserStatus): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
    });
    return this.toResponseDto(user);
  }

  async searchUsers(
    query: string,
    companyId?: string,
  ): Promise<MentionUserResponseDto[]> {
    if (!query || query.trim().length < 2) return [];

    const where: Prisma.UserWhereInput = {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
      status: UserStatus.ACTIVE,
      isProfessional: true, // Apenas profissionais aparecem na busca de menção
    };

    if (companyId && companyId !== 'null') {
      where.companyId = companyId;
    }

    const users = await this.prisma.user.findMany({
      where,
      take: 10, // Performance: Limite hard
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        professionalRole: true,
        isProfessional: true,
        company: { select: { id: true, name: true } },
      },
    });

    return users.map(
      (u) =>
        new MentionUserResponseDto({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          isProfessional: u.isProfessional,
          // 🛠️ CORREÇÃO AQUI:
          // Se for null (banco), converte para undefined (DTO)
          professionalRole: u.professionalRole ?? undefined,
          company: u.company ?? undefined,
        }),
    );
  }

  // Mantidos para compatibilidade, mas idealmente usariam o findAll com filtros
  async findByCompany(
    companyId: string,
    includeNull = false,
  ): Promise<UserResponseDto[]> {
    const where: Prisma.UserWhereInput = includeNull
      ? { OR: [{ companyId }, { companyId: null }] }
      : { companyId };

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return users.map((u) => this.toResponseDto(u));
  }
}
