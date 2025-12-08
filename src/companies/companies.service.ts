import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Company, CompanyStatus } from '@prisma/client'; // Importando Enums gerados
import type { Cache } from 'cache-manager';
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
import { Counter, Histogram } from 'prom-client';
import { PrismaService } from 'src/prisma/prisma.service';

// --- DTOs Ajustados ao Schema ---

export class CreateCompanyDto {
  @IsNotEmpty() @IsString() name: string;
  @IsNotEmpty() @IsString() cnpj: string;
  @IsNotEmpty() @IsString() telefone: string; // Obrigatório no Schema
  @IsNotEmpty() @IsEmail() email: string;
  
  // Endereço (Obrigatórios no Schema)
  @IsNotEmpty() @IsString() endereco: string;
  @IsNotEmpty() @IsString() numero: string;
  @IsOptional() @IsString() complemento?: string;
  @IsNotEmpty() @IsString() bairro: string;
  @IsNotEmpty() @IsString() cidade: string;
  @IsNotEmpty() @IsString() estado: string;
  @IsNotEmpty() @IsString() cep: string;
  
  @IsOptional() @IsString() ramoAtividade?: string;
  
  @IsOptional() @IsUUID() userCreateId?: string;
  
  // Status é opcional na criação, pois o banco tem default(ATIVO)
  @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;
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
  @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;
}

export class PaginationDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
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
  ) {}

  /**
   * Wrapper de Resiliência: Retry com Backoff Exponencial + Timeout
   */
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
          // Repassa o erro original se for conhecido, ou lança genérico
          throw error instanceof Error ? error : new InternalServerErrorException('Database unavailable');
        }
        
        await new Promise((res) => setTimeout(res, 100 * Math.pow(2, attempt)));
      }
    }
    // Correção do erro TS2366: Retorno garantido caso o loop termine de forma inesperada
    throw new InternalServerErrorException('Unexpected execution flow in resilience wrapper');
  }

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const sanitizedCnpj = createCompanyDto.cnpj.replace(/\D/g, '');

    // Idempotência
    const existing = await this.prisma.company.findUnique({ where: { cnpj: sanitizedCnpj } });
    if (existing) {
        throw new BadRequestException('Empresa já cadastrada com este CNPJ.');
    }

    const company = await this.executeWithResilience('create_company', () => 
      this.prisma.company.create({
        data: {
          ...createCompanyDto,
          cnpj: sanitizedCnpj,
          // Garante que o status usa o Enum correto se não for passado
          status: createCompanyDto.status || CompanyStatus.ATIVO,
        },
      })
    );

    await this.cacheManager.del('companies_list_all'); 
    companyCreationCounter.inc();
    
    return company;
  }

  async findAll(pagination: PaginationDto = { page: 1, limit: 10 }): Promise<{ data: Partial<Company>[]; total: number; page: number; lastPage: number }> {
    // Correção do erro TS18048: Definindo valores default na desestruturação
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;
    const cacheKey = `companies_list_${page}_${limit}`;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
        return cached as any;
    }

    const [data, total] = await this.executeWithResilience('find_all', () => 
      this.prisma.$transaction([
        this.prisma.company.findMany({
          skip,
          take: limit,
          where: { status: CompanyStatus.ATIVO }, // Uso do Enum correto
          select: {
             id: true,
             name: true,
             cnpj: true,
             email: true,
             status: true,
             telefone: true,
             cidade: true,
             estado: true
             // Selecione apenas o necessário para listagens
          }
        }),
        this.prisma.company.count({ where: { status: CompanyStatus.ATIVO } }),
      ])
    );

    const result = { data, total, page, lastPage: Math.ceil(total / limit) };
    await this.cacheManager.set(cacheKey, result, 60000);

    return result;
  }

  async findOne(id: string): Promise<Company> {
    const cacheKey = `company_${id}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached as Company;

    const company = await this.executeWithResilience('find_one', () =>
      this.prisma.company.findUnique({ where: { id } })
    );

    if (!company) {
      throw new NotFoundException(`Empresa ${id} não encontrada.`);
    }

    await this.cacheManager.set(cacheKey, company, 300000); 
    return company;
  }

  /**
   * U - Update com verificação de Permissão (RBAC)
   * Agora aceita o argumento opcional currentUserRole
   */
  async update(id: string, updateCompanyDto: UpdateCompanyDto, currentUserRole?: string): Promise<Company> {
    // 1. Autorização (RBAC)
    // Se uma role for passada, validamos. Se não for (ex: chamada interna), deixamos passar ou bloqueamos conforme sua regra.
    if (currentUserRole && currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') {
        // Importe ForbiddenException de @nestjs/common se preferir o status 403
        throw new BadRequestException('Permissão insuficiente para alterar empresas.');
    }

    await this.findOne(id); 

    // Sanitização de CNPJ
    if (updateCompanyDto.cnpj) {
        updateCompanyDto.cnpj = updateCompanyDto.cnpj.replace(/\D/g, '');
    }

    const updated = await this.executeWithResilience('update_company', () =>
      this.prisma.company.update({
        where: { id },
        data: {
            ...updateCompanyDto,
            status: updateCompanyDto.status 
        },
      })
    );

    // Invalidação de Cache
    await this.cacheManager.del(`company_${id}`);

    try {
        const store = (this.cacheManager as any).store;
        if (store && typeof store.keys === 'function') {
            const keys: string[] = await store.keys('companies_list_*');
            await Promise.all(keys.map(k => this.cacheManager.del(k)));
        }
    } catch (e) {
        this.logger.error('Falha ao limpar cache de listas no update', e);
    }

    return updated;
  }

  /**
   * D - Soft Delete
   */
  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.executeWithResilience('soft_delete_company', () =>
      this.prisma.company.update({
        where: { id },
        data: { 
            status: CompanyStatus.INATIVO,
        }, 
      })
    );

    await this.cacheManager.del(`company_${id}`);
    
    // Invalidação de Listas (Pattern Delete)
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