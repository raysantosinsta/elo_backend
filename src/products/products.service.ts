/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma, SimpleStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private get db() {
    return this.prisma.extended;
  }

  // --- CREATE ---
  async create(createProductDto: CreateProductDto) {
    const { materials, ...productData } = createProductDto;
    
    const userId = this.cls.get<string>('userId');
    const companyId = this.cls.get<string>('tenantId');

    return this.db.product.create({
      data: {
        ...productData,
        companyId, // Garantindo o vínculo do tenant
        userCreateId: userId,
        userUpdateId: userId,
        materials: materials && materials.length > 0 ? {
          create: materials.map((mat) => ({
            materialId: mat.materialId,
            quantidade: mat.quantidade,
            // Injeção manual obrigatória em Nested Writes
            userCreateId: userId,
            userUpdateId: userId,
          })),
        } : undefined,
      },
      include: {
        materials: {
          include: { material: true },
        },
      },
    });
  }

  // --- FIND ALL ---
  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      status: SimpleStatus.ACTIVE,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { referece: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      this.db.product.count({ where }),
      this.db.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { materials: true } },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  // --- FIND ONE ---
  async findOne(id: string) {
    const product = await this.db.product.findUnique({
      where: { id },
      include: {
        materials: {
          include: { material: true },
        },
        userCreate: { select: { id: true, name: true } },
      },
    });

    if (!product) throw new NotFoundException(`Produto não encontrado`);
    return product;
  }

  // --- UPDATE ---
  async update(id: string, updateProductDto: UpdateProductDto) {
    const { materials, ...productData } = updateProductDto;
    const userId = this.cls.get<string>('userId');

    const data: Prisma.ProductUpdateInput = {
      ...productData,
    };

    if (materials) {
      data.materials = {
        deleteMany: {}, 
        create: materials.map((mat) => ({
          materialId: mat.materialId,
          quantidade: mat.quantidade,
          // Injeção manual obrigatória em Nested Writes
          userCreateId: userId,
          userUpdateId: userId,
        })),
      };
    }

    try {
      return await this.db.product.update({
        where: { id },
        data,
        include: { materials: true },
      });
    } catch (error: any) {
      if (error.code === 'P2025') throw new NotFoundException('Produto não encontrado');
      throw error;
    }
  }

  // --- REMOVE (Soft Delete) ---
  async remove(id: string) {
    try {
      return await this.db.product.update({
        where: { id },
        data: {
          status: SimpleStatus.INACTIVE,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') throw new NotFoundException('Produto não encontrado');
      throw error;
    }
  }

  // --- MÉTODOS DE MATERIAIS (PIVÔ) ---

  async addMaterial(productId: string, materialId: string, quantidade: number) {
    await this.findOne(productId); 
    const userId = this.cls.get<string>('userId');

    return this.db.productMaterial.upsert({
      where: {
        productId_materialId: { productId, materialId },
      },
      update: {
        quantidade,
        userUpdateId: userId, // Injeção manual pois upsert tem lógica complexa
      },
      create: {
        productId,
        materialId,
        quantidade,
        userCreateId: userId, // CORREÇÃO: userCreateId é obrigatório aqui
        userUpdateId: userId, // CORREÇÃO: userUpdateId é obrigatório aqui
      },
    });
  }

  async removeMaterial(productId: string, materialId: string) {
    await this.findOne(productId);

    try {
      return await this.db.productMaterial.delete({
        where: {
          productId_materialId: { productId, materialId },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') throw new NotFoundException('Vínculo não encontrado');
      throw error;
    }
  }
}