/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma, SimpleStatus } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService // Usado apenas para pegar ID no nested write se necessário
  ) {}

  // Atalho para o cliente estendido
  private get db() {
    return this.prisma.extended;
  }

  // --- CREATE ---
  // src/products/products.service.ts

  // --- CREATE ---
  async create(createProductDto: CreateProductDto) {
    const { materials, ...productData } = createProductDto;
    
    // 1. Pegue os IDs do contexto (CLS)
    const userId = this.cls.get('userId');
    const companyId = this.cls.get('tenantId'); // <--- ADICIONE ISSO

    return this.db.product.create({
      data: {
        ...productData,
        
        // 2. Injete explicitamente para garantir que não falhe
        companyId: companyId, // <--- ADICIONE ISSO
        
        // O userCreateId parece estar vindo do extended, mas se quiser garantir:
        // userCreateId: userId, 

        materials: materials && materials?.length > 0 ? {
          create: materials.map((mat) => ({
            materialId: mat.materialId,
            quantidade: mat.quantidade,
            userCreateId: userId,
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

    // O filtro 'companyId' é injetado automaticamente no 'findMany' e 'count'
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
    // O extended converte findUnique para findFirst e injeta companyId
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
    // Verifica existência (Opcional, pois o update do extended já filtra por companyId e lançaria erro se não achasse)
    // await this.findOne(id); 

    const { materials, ...productData } = updateProductDto;
    const userId = this.cls.get('userId');

    // Montando o objeto de dados. userUpdateId será injetado pelo extended na raiz.
    const data: Prisma.ProductUpdateInput = {
      ...productData,
    };

    // Tratamento de materiais (Reset: apaga tudo e recria)
    if (materials) {
      data.materials = {
        deleteMany: {}, // Remove vínculos existentes
        create: materials.map((mat) => ({
          materialId: mat.materialId,
          quantidade: mat.quantidade,
          userCreateId: userId, // Injeção manual no nested
        })),
      };
    }

    try {
      return await this.db.product.update({
        where: { id },
        data,
        include: { materials: true },
      });
    } catch (error) {
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
          // userUpdateId injetado automaticamente
        },
      });
    } catch (error) {
      if (error.code === 'P2025') throw new NotFoundException('Produto não encontrado');
      throw error;
    }
  }

  // --- Métodos de Materiais (Pivô) ---

  async addMaterial(productId: string, materialId: string, quantidade: number) {
    // Verifica se o produto pertence à empresa (garantia extra)
    await this.findOne(productId); 
    
    // Como ProductMaterial não tem vínculo direto com Company (depende do Product),
    // o extended pode não filtrar companyId aqui se o modelo ProductMaterial não tiver esse campo.
    // Mas ele vai injetar userCreateId/userUpdateId.

    return this.db.productMaterial.upsert({
      where: {
        productId_materialId: { productId, materialId },
      },
      update: {
        quantidade,
        // userUpdateId automático
      },
      create: {
        productId,
        materialId,
        quantidade,
        // userCreateId automático
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
    } catch (error) {
      if (error.code === 'P2025') throw new NotFoundException('Vínculo não encontrado');
      throw error;
    }
  }
}