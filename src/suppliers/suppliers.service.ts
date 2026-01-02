import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service'; // Ajuste o caminho do seu PrismaService
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSupplierDto: CreateSupplierDto) {
    const { companyId, userCreateId, ...data } = createSupplierDto;

    return this.prisma.supplier.create({
      data: {
        ...data,
        company: {
          connect: { id: companyId },
        },
        userCreate: {
          connect: { id: userCreateId },
        },
      },
    });
  }

  // AQUI RESOLVE O SEU ERRO 404: Filtragem por companyId
  async findAll(companyId?: string) {
    return this.prisma.supplier.findMany({
      where: {
        companyId: companyId ? companyId : undefined,
        status: 'ACTIVE', // Opcional: trazer apenas os ativos
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.supplier.findUnique({
      where: { id },
    });
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    const { companyId, userCreateId, userUpdateId, ...data } = updateSupplierDto;

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...data,
        // Se houver usuário de atualização, conectamos
        userUpdate: userUpdateId ? { connect: { id: userUpdateId } } : undefined,
      },
    });
  }

  async remove(id: string) {
    // Opção 1: Deletar fisicamente
    return this.prisma.supplier.delete({
      where: { id },
    });

    // Opção 2: Soft Delete (Inativar), descomente se preferir:
    /*
    return this.prisma.supplier.update({
      where: { id },
      data: { status: 'INACTIVE' }
    });
    */
  }
}