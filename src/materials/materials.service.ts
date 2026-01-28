/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException, 
  Logger 
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMaterialDto, PaginationDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { ClsService } from 'nestjs-cls';
import { Prisma, SimpleStatus } from '@prisma/client';

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ===========================================================================
  // 🔒 HELPER DE SEGURANÇA (Igual ao UsersService)
  // ===========================================================================
  /**
   * Verifica se o usuário tem permissão para tocar neste recurso.
   * Master pode tudo. Admin só pode tocar no que é da sua empresa.
   */
  private validateOwnership(resource: { companyId: string | null }) {
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    // Se for Master, libera
    if (isMaster) return;

    // Se não for da mesma empresa, bloqueia
    if (resource.companyId !== tenantId) {
      this.logger.warn(`⛔ Tentativa de acesso negado. Tenant: ${tenantId} tentou acessar Material da Company: ${resource.companyId}`);
      throw new ForbiddenException('Acesso negado: Você não tem permissão para alterar este registro.');
    }
  }

  // ===========================================================================
  // 📝 ESCRITA
  // ===========================================================================

  async create(createMaterialDto: CreateMaterialDto) {
    const userId = this.cls.get('userId');
    const tenantId = this.cls.get('tenantId');

    // O PrismaService (extended) já injeta companyId automaticamente se não for Master.
    // Mas para garantir a tipagem correta, preparamos o data object.
    
    return this.prisma.extended.material.create({
      data: {
        ...createMaterialDto,
        // Fallback de segurança: Se o extended falhar, garantimos aqui
        companyId: tenantId, 
        userCreateId: userId,
        userUpdateId: userId,
        status: SimpleStatus.ACTIVE,
      },
    });
  }

  async update(id: string, updateMaterialDto: UpdateMaterialDto) {
    // 1. Busca o material existente para validar posse
    const materialToUpdate = await this.findOne(id);
    
    // 2. Valida segurança
    this.validateOwnership(materialToUpdate);

    const userId = this.cls.get('userId');

    return this.prisma.extended.material.update({
      where: { id },
      data: {
        ...updateMaterialDto,
        userUpdateId: userId,
      },
    });
  }

  async remove(id: string) {
    // 1. Busca para validar
    const materialToDelete = await this.findOne(id);
    
    // 2. Valida segurança
    this.validateOwnership(materialToDelete);

    const userId = this.cls.get('userId');

    // Soft Delete
    return this.prisma.extended.material.update({
      where: { id },
      data: {
        status: SimpleStatus.INACTIVE,
        userUpdateId: userId,
      },
    });
  }

  // ===========================================================================
  // 🔍 LEITURA
  // ===========================================================================

  async findAll(pagination: PaginationDto) {
    const { page = 1, limit = 10, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.MaterialWhereInput = {
      status: SimpleStatus.ACTIVE,
      // O PrismaService (extended) injeta o filtro de companyId automaticamente aqui
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { type: { contains: search, mode: 'insensitive' } },
          { color: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      this.prisma.extended.material.count({ where }),
      this.prisma.extended.material.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          // Exemplo de include seguro (apenas campos necessários)
          // supplierMaterials: { include: { supplier: { select: { name: true } } } }
        }
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

  async findOne(id: string) {
    // Usamos findFirst ao invés de findUnique porque a extensão converte 
    // findUnique -> findFirst para aplicar o filtro de companyId
    const material = await this.prisma.extended.material.findFirst({
      where: { id },
      include: {
        userCreate: { select: { id: true, name: true } },
      },
    });

    if (!material) {
      throw new NotFoundException('Material não encontrado.');
    }

    return material;
  }
}