/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma, SimpleStatus, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ClsService } from 'nestjs-cls'; // 🔥 Contexto
import { PrismaService } from 'src/prisma/prisma.service';

const SALT_ROUNDS = 10;

// --- Interfaces Ajustadas (DTOs internos) ---
export interface UserCreateData {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  document?: string;
  contact: string;
  professionalRole?: string;
  // companyId: string; -> Removido, vem do contexto ou DTO (validado)
}

export interface UserUpdateData {
  id: string;
  // userUpdateId: string; -> Removido, auditado pelo contexto? (Opcional)
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  status?: SimpleStatus;
  document?: string;
  contact?: string;
  professionalRole?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService, // 🔥 Injeção CLS
  ) { }

  /**
   * Cria um novo usuário.
   * O Prisma Extension injeta o companyId automaticamente se não for Master.
   */
  public async createUser(data: UserCreateData & { companyId?: string }): Promise<User> {
    const { password, companyId, ...rest } = data;
    const hashedPassword = await bcrypt.hash(password, 10); // SALT_ROUNDS = 10

    // Recupera dados do contexto
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    let targetCompanyId = tenantId;
    
    // Regra do Master
    if (isMaster) {
        if (!companyId) throw new BadRequestException('Master deve informar o ID da empresa.');
        targetCompanyId = companyId;
    }

    // 🔥 A CORREÇÃO ESTÁ AQUI:
    // 1. Mudamos o tipo para 'UserUncheckedCreateInput'
    // 2. Usamos 'companyId' (string) ao invés de 'company: { connect... }'
    
    const userData: Prisma.UserUncheckedCreateInput = {
      ...rest,
      password: hashedPassword,
      status: SimpleStatus.ACTIVE,
      companyId: targetCompanyId, // <--- ID direto (Scalar)
    };

    try {
      // Agora o Prisma aceita misturar companyId (seu) + userCreateId (da extension)
      const user = await this.prisma.extended.user.create({ data: userData });
      return user;
    } catch (error: any) {
      console.error('❌ Erro Prisma:', error); 

      if (error.code === 'P2002') {
        throw new ConflictException('Email ou Documento já cadastrado.');
      }
      if (error.code === 'P2003') { 
         throw new BadRequestException('A empresa informada não existe (FK Error).');
      }
      
      throw new BadRequestException('Erro ao criar usuário. Veja o terminal do servidor.');
    }
  }

  /**
   * Busca por ID.
   * A extensão garante que Admin só ache usuário da sua empresa.
   */
  public async findUserById(userId: string): Promise<User> {
    const user = await this.prisma.extended.user.findFirst({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  /**
   * Busca textual.
   * A extensão aplica o filtro de empresa automaticamente.
   */
  public async searchUsers(query: string): Promise<User[]> {
    return this.prisma.extended.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
        status: SimpleStatus.ACTIVE,
      },
      take: 10,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Listagem com Paginação.
   * Filtro de companyId injetado automaticamente pela extensão.
   */
  public async findAll(
    page: number,
    limit: number,
    filters: { status?: SimpleStatus; role?: UserRole; companyId?: string }
  ): Promise<User[]> {
    const skip = (page - 1) * limit;
    
    // Se for Master e quiser filtrar por empresa específica via Query Param
    const isMaster = this.cls.get<boolean>('isMaster');
    const where: any = { ...filters }; // Copia filtros (status, role)

    // Ajuste fino para Master filtrar por empresa
    if (isMaster && filters.companyId) {
        where.companyId = filters.companyId;
    } 
    // Se não for master, remove companyId do filtro explícito para não conflitar com a injeção da extensão
    // (A extensão adicionará companyId = tenantId)
    else if (!isMaster) {
        delete where.companyId; 
    }

    return this.prisma.extended.user.findMany({
      skip,
      take: limit,
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Lista usuários de uma empresa (Para Dropdowns).
   */
  public async findUsersByCompany(companyId: string): Promise<User[]> {
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    // Validação de Segurança Extra (caso bypass da extensão)
    if (!isMaster && companyId !== tenantId) {
        throw new ForbiddenException('Acesso negado a outra empresa.');
    }

    return this.prisma.extended.user.findMany({
      where: {
        companyId, // Se for admin, a extensão redundante garante, mas ok manter
        status: SimpleStatus.ACTIVE,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Atualização.
   */
  public async updateUser(data: UserUpdateData): Promise<User> {
    const { id, password, ...updateFields } = data;

    // Verifica existência e permissão (via findFirst da extensão)
    await this.findUserById(id);

    const updateData: Prisma.UserUpdateInput = { ...updateFields };

    if (password) {
      updateData.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    try {
      return await this.prisma.extended.user.update({
        where: { id },
        data: updateData,
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email/Documento em uso.');
      }
      throw error;
    }
  }

  /**
   * Remoção (Soft Delete ou Hard Delete).
   * A extensão garante que Admin só apague da sua empresa.
   */
  public async removeUser(userId: string): Promise<User> {
    await this.findUserById(userId); // Garante que existe e é meu

    try {
      return await this.prisma.extended.user.delete({
        where: { id: userId },
      });
    } catch (error) {
      throw new BadRequestException('Erro ao remover usuário.');
    }
  }
}