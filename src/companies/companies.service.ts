/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Company, SimpleStatus } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from 'class-validator';
import { ClsService } from 'nestjs-cls';
import { Counter, Histogram } from 'prom-client';
import { PrismaService } from 'src/prisma/prisma.service';

// --- DTOs (Mantidos) ---
export class CreateCompanyDto {
  @IsNotEmpty() @IsString() name: string;
  @IsNotEmpty() @IsString() cnpj: string;
  @IsNotEmpty() @IsString() telefone: string;
  @IsNotEmpty() @IsEmail() email: string;
  @IsNotEmpty() @IsString() endereco: string;
  @IsNotEmpty() @IsString() numero: string;
  @IsOptional() @IsString() complemento?: string;
  @IsNotEmpty() @IsString() bairro: string;
  @IsNotEmpty() @IsString() cidade: string;
  @IsNotEmpty() @IsString() estado: string;
  @IsNotEmpty() @IsString() cep: string;
  @IsOptional() @IsString() ramoAtividade?: string;
  @IsOptional() @IsUUID() userCreateId?: string;
  @IsOptional() @IsEnum(SimpleStatus) status?: SimpleStatus;
}

export class UpdateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() endereco?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() ramoAtividade?: string;
  @IsOptional() @IsUUID() userUpdateId?: string;
  @IsOptional() @IsEnum(SimpleStatus) status?: SimpleStatus;
}

export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number) // <--- Converte "1" para 1
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100) // Mantido como você pediu
  @Type(() => Number) // <--- Converte "100" para 100
  limit?: number;
}

// --- Métricas ---
const companyCreationCounter = new Counter({
  name: 'company_created_total',
  help: 'Total number of companies created',
});

const dbLatencyHistogram = new Histogram({
  name: 'db_operation_duration_seconds',
  help: 'Duration of DB operations in seconds',
  labelNames: ['operation'],
});

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly cls: ClsService,
  ) { }

  // ===========================================================================
  // 🔥 HELPER DE SEGURANÇA (NOVO)
  // ===========================================================================
  /**
   * Valida se o usuário logado tem permissão para alterar o recurso alvo.
   * Se for MASTER, passa direto.
   * Se for ADMIN/USER, o ID do recurso deve bater com o ID da empresa do usuário.
   */
  private validateOwnership(targetCompanyId: string): void {
    const isMaster = this.cls.get<boolean>('isMaster');
    const userTenantId = this.cls.get<string>('tenantId');

    // Se for Master, tem acesso total
    if (isMaster) return;

    // Se não for Master, o ID alvo deve ser IGUAL ao ID da empresa dele
    if (targetCompanyId !== userTenantId) {
      this.logger.warn(`⛔ Tentativa de Acesso Ilegal: Tenant ${userTenantId} tentou acessar Empresa ${targetCompanyId}`);
      throw new ForbiddenException();
    }
  }

  // Wrapper de Resiliência (Mantido)
  private async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>,
    retries = 3,
    timeoutMs = 5000
  ): Promise<T> {
    const endTimer = dbLatencyHistogram.labels(operation).startTimer();
    let attempt = 0;

    while (attempt < retries) {
      try {
        const result = await Promise.race([
          fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs),
          ),
        ]);
        endTimer();
        return result as T;
      } catch (error: any) {
        attempt++;
        this.logger.warn(`Tentativa ${attempt} falhou para ${operation}: ${error.message}`);

        if (attempt >= retries) {
          endTimer();
          this.logger.error(`Falha crítica em ${operation} após ${retries} tentativas.`);
          throw error instanceof Error ? error : new InternalServerErrorException('Database unavailable');
        }

        await new Promise((res) => setTimeout(res, 100 * Math.pow(2, attempt)));
      }
    }
    throw new InternalServerErrorException('Unexpected execution flow in resilience wrapper');
  }

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const sanitizedCnpj = createCompanyDto.cnpj.replace(/\D/g, '');
    const sanitizedPhone = createCompanyDto.telefone.replace(/\D/g, '');

    const existing = await this.prisma.company.findUnique({ where: { cnpj: sanitizedCnpj } });
    if (existing) {
      throw new BadRequestException('Empresa já cadastrada com este CNPJ.');
    }

    const userId = this.cls.get<string>('userId');

    // Criação não precisa de validateOwnership pois está criando um novo recurso
    const company = await this.executeWithResilience('create_company', () =>
      this.prisma.company.create({
        data: {
          ...createCompanyDto,
          cnpj: sanitizedCnpj,
          telefone: sanitizedPhone,
          userCreateId: userId,
          status: createCompanyDto.status || SimpleStatus.ACTIVE,
        },
      })
    );

    await this.cacheManager.del('companies_list_all');
    companyCreationCounter.inc();

    return company;
  }

  // --- LISTAGEM ---
  async findAll(
    pagination: PaginationDto
  ): Promise<{ data: Partial<Company>[]; total: number; page: number; lastPage: number }> {

    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    const cacheScope = isMaster ? 'master_view' : `tenant_${tenantId}`;
    const cacheKey = `companies_list_${cacheScope}_${page}_${limit}`;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached as any;
    }

    const where: any = { status: SimpleStatus.ACTIVE };

    if (!isMaster) {
      if (!tenantId) {
        return { data: [], total: 0, page, lastPage: 0 };
      }
      where.id = tenantId;
    }

    const [data, total] = await this.executeWithResilience('find_all_companies', () =>
      this.prisma.$transaction([
        this.prisma.company.findMany({
          skip,
          take: limit,
          where,
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            cnpj: true,
            email: true,
            status: true,
            telefone: true,
            cidade: true,
            estado: true,
          }
        }),
        this.prisma.company.count({ where }),
      ])
    );

    const result = { data, total, page, lastPage: Math.ceil(total / limit) };
    await this.cacheManager.set(cacheKey, result, 60000);
    return result;
  }

  // --- BUSCA UNITÁRIA (Protegida) ---
  async findOne(id: string): Promise<Company> {
    // 🔥 1. Valida Permissão ANTES de buscar (Segurança primeiro)
    this.validateOwnership(id);

    const cacheKey = `company_${id}`;
    let company: Company | null | undefined = await this.cacheManager.get<Company>(cacheKey);

    if (!company) {
      company = await this.executeWithResilience('find_one', () =>
        this.prisma.company.findUnique({ where: { id } })
      );
    }

    if (!company) {
      throw new NotFoundException(`Empresa ${id} não encontrada.`);
    }

    // (A validação de ownership já foi feita no início, mas como usamos cache, 
    // a validação lá em cima garante que, mesmo se vier do cache, o ID bate).

    await this.cacheManager.set(cacheKey, company, 300000);
    return company;
  }

  // --- ATUALIZAÇÃO (Protegida) ---
  async update(
    id: string,
    updateCompanyDto: UpdateCompanyDto
  ): Promise<Company> {
    // 🔥 1. Validação de Segurança
    this.validateOwnership(id);

    // 2. Busca dados atuais (O findOne também valida, dupla proteção é ok)
    const currentCompanyData = await this.findOne(id);
    const isMaster = this.cls.get<boolean>('isMaster');
    const userId = this.cls.get<string>('userId');

    if (
      updateCompanyDto.status === SimpleStatus.INACTIVE &&
      !isMaster
    ) {
      throw new ForbiddenException('Apenas usuários Master podem inativar uma empresa.');
    }

    // Limpeza de dados
    if (updateCompanyDto.cnpj) {
      updateCompanyDto.cnpj = updateCompanyDto.cnpj.replace(/\D/g, '');
      if (updateCompanyDto.cnpj !== currentCompanyData.cnpj) {
        const exists = await this.prisma.company.findUnique({
          where: { cnpj: updateCompanyDto.cnpj }
        });
        if (exists) throw new BadRequestException('Este CNPJ já está em uso.');
      }
    }

    if (updateCompanyDto.telefone) {
      updateCompanyDto.telefone = updateCompanyDto.telefone.replace(/\D/g, '');
    }

    const updated = await this.executeWithResilience('update_company', () =>
      this.prisma.company.update({
        where: { id },
        data: {
          ...updateCompanyDto,
          userUpdateId: userId,
          ...(updateCompanyDto.status && { status: updateCompanyDto.status }),
        },
      })
    );

    await this.cacheManager.del(`company_${id}`);

    // Limpa cache de listas
    try {
      const store = (this.cacheManager as any).store;
      if (store && typeof store.keys === 'function') {
        const keys: string[] = await store.keys('companies_list_*');
        if (keys.length > 0) {
          await Promise.all(keys.map(k => this.cacheManager.del(k)));
        }
      }
    } catch (e) {
      this.logger.error('Failed to clear list cache on update', e);
    }

    return updated;
  }

  // --- REMOÇÃO (Protegida) ---
  async remove(id: string): Promise<void> {
    // 🔥 1. Validação de Segurança
    this.validateOwnership(id);

    // 2. Busca para confirmar existência
    await this.findOne(id);

    const isMaster = this.cls.get<boolean>('isMaster');
    if (!isMaster) {
      throw new ForbiddenException('Permissão insuficiente para remover empresas.');
    }

    await this.executeWithResilience('soft_delete_company', () =>
      this.prisma.company.update({
        where: { id },
        data: {
          status: SimpleStatus.INACTIVE,
        },
      })
    );

    await this.cacheManager.del(`company_${id}`);

    try {
      const store = (this.cacheManager as any).store;
      if (store && typeof store.keys === 'function') {
        const keys: string[] = await store.keys('companies_list_*');
        await Promise.all(keys.map(k => this.cacheManager.del(k)));
      }
    } catch (e) {
      this.logger.error('Falha ao limpar cache de listas no remove', e);
    }
  }
}