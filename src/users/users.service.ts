/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
    Prisma,
    SimpleStatus,
    User,
    UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service'; 

// --- Configuração ---
const SALT_ROUNDS = 10;

// --- Tipos de Dados de Input ---

export interface UserCreateData {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    document?: string;
    contact: string;
    professionalRole?: string;
    companyId: string;
}

export interface UserUpdateData {
    id: string;
    userUpdateId: string; // Para auditoria no código
    name?: string;
    email?: string;
    password?: string;
    role?: UserRole;
    status?: SimpleStatus;
    document?: string;
    contact?: string; 
    professionalRole?: string;
    companyId?: string;
}


// --- Classe do Serviço ---
@Injectable()
export class UsersService { 

    // Ajuste para Injeção de Dependência do Prisma Service
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Cria um novo usuário no banco de dados.
     */
    public async createUser(data: UserCreateData): Promise<User> {
        const { name, email, password, role, document, contact, professionalRole, companyId } = data;
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const userData: Prisma.UserCreateInput = {
            name,
            email,
            password: hashedPassword,
            role,
            contact,
            ...(document && { document }),
            ...(professionalRole && { professionalRole }),
            company: { connect: { id: companyId } },
            status: SimpleStatus.ACTIVE,
        };

        try {
            // Usando o prisma injetado
            const user = await this.prisma.user.create({ data: userData });
            return user;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                // Conflito de UNIQUE (Email ou Documento)
                throw new ConflictException('Email ou Documento já cadastrado.');
            }
            throw new BadRequestException('Erro ao criar usuário.', error.message);
        }
    }

    /**
     * Busca um usuário pelo seu ID.
     */
    public async findUserById(userId: string): Promise<User | null> {
        return this.prisma.user.findUnique({ where: { id: userId } });
    }

    /**
     * Realiza uma busca textual por nome ou email dentro de uma empresa.
     */
    public async searchUsers(query: string, companyId: string): Promise<User[]> {
        return this.prisma.user.findMany({
            where: {
                companyId,
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
     * Lista todos os usuários, com paginação e filtros.
     */
    public async findAll(
        page: number, 
        limit: number, 
        companyId?: string, 
        status?: SimpleStatus, 
        role?: UserRole
    ): Promise<User[]> {
        const skip = (page - 1) * limit;
        return this.prisma.user.findMany({
            skip,
            take: limit,
            // Ajustado para permitir filtros opcionais
            where: { companyId, status, role }, 
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Busca todos os usuários vinculados a uma empresa específica.
     * Útil para dropdowns ou listagens simples sem paginação.
     */
    public async findUsersByCompany(companyId: string): Promise<User[]> {
        return this.prisma.user.findMany({
            where: {
                companyId: companyId,
                status: SimpleStatus.ACTIVE, // Opcional: Remova se quiser incluir INATIVOS
            },
            orderBy: {
                name: 'asc',
            },
            // Opcional: Selecionar apenas campos necessários para reduzir tráfego
            // select: { id: true, name: true, email: true, role: true, professionalRole: true }
        });
    }

    /**
     * Atualiza os dados de um usuário.
     */
    public async updateUser(data: UserUpdateData): Promise<User> {
        const { id, userUpdateId, password, contact, ...updateFields } = data;

        // O campo userUpdateId é apenas para auditoria no serviço ou controller (se necessário)
        // e não faz parte da atualização do modelo User.

        const updateData: Prisma.UserUpdateInput = {
            ...updateFields,
            ...(contact && { contact: contact }), // Mapeamento DTO.contact -> Model.contact
        };
        
        if (password) {
            (updateData as any).password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        try {
            const user = await this.prisma.user.update({
                where: { id },
                data: updateData,
            });
            return user;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                    throw new ConflictException('O email ou documento fornecido já está em uso por outro usuário.');
                }
                if (error.code === 'P2025') {
                    throw new NotFoundException('Usuário não encontrado para atualização.');
                }
            }
            throw new BadRequestException('Erro ao atualizar usuário.', error.message);
        }
    }

    /**
     * Remove fisicamente um usuário do banco de dados.
     */
    public async removeUser(userId: string): Promise<User> {
        try {
            return await this.prisma.user.delete({ where: { id: userId } });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new NotFoundException('Usuário não encontrado para remoção.');
            }
            throw error;
        }
    }
}