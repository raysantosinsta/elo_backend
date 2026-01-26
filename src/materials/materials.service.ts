/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { ClsService } from 'nestjs-cls';
import { Prisma, SimpleStatus } from '@prisma/client';

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // Getter para usar a extensão do Prisma (onde a lógica de Tenant costuma ficar)
  private get db() {
    return this.prisma.extended;
  }

  // --- CREATE ---
  async create(createMaterialDto: CreateMaterialDto) {
    // 1. Pega os IDs do contexto atual (Sessão do usuário)
    const userId = this.cls.get('userId');
    const companyId = this.cls.get('tenantId');

    // 2. Criação com injeção EXPLICITA para evitar erro de "Argument missing"
    return this.db.material.create({
      data: {
        ...createMaterialDto,
        companyId: companyId,       // Garante vínculo com a empresa
        userCreateId: userId,       // Garante vínculo de auditoria (quem criou)
        userUpdateId: userId,       // Inicializa update igual create
        status: SimpleStatus.ACTIVE // Padrão
      },
    });
  }

  // --- FIND ALL (Com paginação e busca) ---
  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where: Prisma.MaterialWhereInput = {
      status: SimpleStatus.ACTIVE,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { type: { contains: search, mode: 'insensitive' } },
          { color: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      this.db.material.count({ where }),
      this.db.material.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        // --- AQUI ESTÁ A MUDANÇA ---
        include: {
          supplierMaterials: {
            include: {
              supplier: {
                select: { name: true } // Traz só o nome para ficar leve
              }
            }
          }
        }
        // ---------------------------
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
    const material = await this.db.material.findUnique({
      where: { id },
      include: {
        userCreate: { select: { id: true, name: true } }, // Quem criou
      },
    });

    if (!material) {
      throw new NotFoundException('Material não encontrado');
    }

    return material;
  }

  // --- UPDATE ---
  async update(id: string, updateMaterialDto: UpdateMaterialDto) {
    // Verifica existência (Opcional se confiar no tratamento de erro do Prisma)
    await this.findOne(id);

    const userId = this.cls.get('userId');

    return this.db.material.update({
      where: { id },
      data: {
        ...updateMaterialDto,
        userUpdateId: userId, // Auditoria de quem atualizou
      },
    });
  }

  // --- REMOVE (Soft Delete) ---
  async remove(id: string) {
    await this.findOne(id);
    const userId = this.cls.get('userId');

    return this.db.material.update({
      where: { id },
      data: {
        status: SimpleStatus.INACTIVE, // Deleção lógica
        userUpdateId: userId,
      },
    });
  }
}