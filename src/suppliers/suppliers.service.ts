/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls'; // 🔥 Importante
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService, // Injeção do Contexto
  ) {}

  async create(dto: CreateSupplierDto) {
    // 1. Pegar dados do contexto (segurança)
    const companyId = this.cls.get<string>('tenantId');
    const userId = this.cls.get<string>('userId');

    // 2. Criar
    return this.prisma.supplier.create({
      data: {
        ...dto,
        // Campos de segurança forçados pelo backend
        companyId: companyId,
        userCreateId: userId,
        // Limpeza básica de documento/telefone (opcional, mas boa prática)
        document: dto.document?.replace(/\D/g, ''),
        phone: dto.phone?.replace(/\D/g, ''),
        zipCode: dto.zipCode?.replace(/\D/g, ''),
      },
    });
  }

  async findAll() {
    const companyId = this.cls.get<string>('tenantId');

    // O Prisma Service estendido já filtra por companyId se configurado,
    // mas aqui garantimos explicitamente para leitura clara.
    return this.prisma.supplier.findMany({
      where: {
        companyId, // Filtro Multi-tenant
        status: 'ACTIVE',
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const companyId = this.cls.get<string>('tenantId');

    const supplier = await this.prisma.supplier.findFirst({
      where: { 
        id, 
        companyId // Garante que não acessa fornecedor de outro tenant
      },
    });

    if (!supplier) throw new NotFoundException('Fornecedor não encontrado.');

    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const companyId = this.cls.get<string>('tenantId');
    const userId = this.cls.get<string>('userId');

    // Verifica existência e permissão
    await this.findOne(id); 

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...dto,
        userUpdateId: userId, // Rastreabilidade
        document: dto.document?.replace(/\D/g, ''),
        phone: dto.phone?.replace(/\D/g, ''),
        zipCode: dto.zipCode?.replace(/\D/g, ''),
      },
    });
  }

  async remove(id: string) {
    // Verifica existência e permissão antes de deletar
    await this.findOne(id);

    // Deleção Física
    return this.prisma.supplier.delete({
      where: { id },
    });

    // Se preferir Soft Delete (Inativar):
    /*
    const userId = this.cls.get<string>('userId');
    return this.prisma.supplier.update({
      where: { id },
      data: { 
        status: 'INACTIVE',
        userUpdateId: userId
      }
    });
    */
  }
}