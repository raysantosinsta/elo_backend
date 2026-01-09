/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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
import { Company, SimpleStatus, User, UserRole } from '@prisma/client'; // Importando Enums gerados
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
  ) { }

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
      throw new BadRequestException('Empresa já cadastrada com este CNPJ.'); // ISSO GERA O 400
    }

    const company = await this.executeWithResilience('create_company', () =>
      this.prisma.company.create({
        data: {
          ...createCompanyDto,
          cnpj: sanitizedCnpj,
          // Garante que o status usa o Enum correto se não for passado
          status: createCompanyDto.status || SimpleStatus.ACTIVE,
        },
      })
    );

    await this.cacheManager.del('companies_list_all');
    companyCreationCounter.inc();

    return company;
  }

  // --- LISTAGEM COM CACHE, RESILIÊNCIA E SEGURANÇA MULTI-TENANT ---
  async findAll(
    pagination: PaginationDto,
    currentUser: User 
  ): Promise<{ data: Partial<Company>[]; total: number; page: number; lastPage: number }> {
    
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    // 1. Definição do Escopo (Quem é você?)
    const isMaster = currentUser.role === UserRole.MASTER;
    const tenantId = currentUser.companyId;

    // 2. Chave de Cache Contextualizada (CRÍTICO PARA SEGURANÇA)
    // Se for Master, a chave é 'master'. Se for Tenant, a chave tem o ID da empresa.
    // Isso impede que a empresa A veja o cache da empresa B.
    const cacheScope = isMaster ? 'master_view' : `tenant_${tenantId}`;
    const cacheKey = `companies_list_${cacheScope}_${page}_${limit}`;

    // 3. Tenta pegar do Cache
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached as any;
    }

    // 4. Construção do Filtro (WHERE)
    const where: any = { 
      status: SimpleStatus.ACTIVE 
    };

    // 🔥 A CORREÇÃO DE OURO:
    // Não filtramos por quem CRIOU (userCreateId), mas sim por quem PERTENCE (companyId).
    if (!isMaster) {
      if (!tenantId) {
        // Usuário sem empresa não vê nada
        return { data: [], total: 0, page, lastPage: 0 }; 
      }
      // O Admin só pode ver a empresa cujo ID bate com o companyId dele
      where.id = tenantId; 
    }

    // 5. Execução no Banco com Resiliência
    const [data, total] = await this.executeWithResilience('find_all_companies', () => 
      this.prisma.$transaction([
        this.prisma.company.findMany({
          skip,
          take: limit,
          where, // <--- Filtro Seguro Aplicado
          orderBy: { name: 'asc' },
          // Projeção para economizar banda e memória
          select: {
            id: true,
            name: true,
            cnpj: true,
            email: true,
            status: true,
            telefone: true,
            cidade: true,
            estado: true,
            // Adicione outros campos visíveis na tabela se precisar
          }
        }),
        this.prisma.company.count({ where }),
      ])
    );

    const result = { data, total, page, lastPage: Math.ceil(total / limit) };
    
    // 6. Salva no Cache (TTL 1 minuto para listas é saudável)
    await this.cacheManager.set(cacheKey, result, 60000);

    return result;
  }

  async findOne(id: string, user?: User): Promise<Company> {
    const cacheKey = `company_${id}`;

    // 1. Tenta pegar do Cache
    let company: Company | null | undefined = await this.cacheManager.get<Company>(cacheKey);

    // 2. Se não estiver no cache, busca no banco com Resiliência
    if (!company) {
      company = await this.executeWithResilience('find_one', () =>
        this.prisma.company.findUnique({ where: { id } })
      );
    }

    // 3. Validação: Existe?
    if (!company) {
      throw new NotFoundException(`Empresa ${id} não encontrada.`);
    }

    // 4. 🔥 SEGURANÇA MULTI-TENANT (Ajuste Crítico) 🔥
    // Verifica se o usuário tem permissão para ver ESTA empresa específica
    if (user) {
      const isMaster = user.role === UserRole.MASTER;
      const belongsToCompany = user.companyId === company.id;

      if (!isMaster && !belongsToCompany) {
        // Se não for Master e o ID da empresa não bater com o do usuário -> BLOQUEIA
        throw new ForbiddenException('Você não tem permissão para acessar os dados desta empresa.');
      }
    }

    // 5. Salva no cache se veio do banco (TTL 5 minutos)
    // Verificamos se 'cached' era null para evitar setar novamente sem necessidade, 
    // mas a lógica simplificada aqui garante que sempre renova ou seta.
    await this.cacheManager.set(cacheKey, company, 300000);

    return company;
  }

  /**
   * U - Update with RBAC permission check
   * Accepts optional currentUserRole
   */
  async update(
    id: string, 
    updateCompanyDto: UpdateCompanyDto, 
    currentUser: User // 🔥 Recebemos o usuário completo agora
  ): Promise<Company> {
    
    // 1. Segurança e Existência (IDOR Protection)
    // Ao passar o 'currentUser' para o findOne, ele valida automaticamente:
    // Se for ADMIN, verifica se id == currentUser.companyId. Se não for, lança Forbidden.
    const currentCompanyData = await this.findOne(id, currentUser);

    // 2. Validação de Regra de Negócio Específica
    // Impedir que um ADMIN inative a empresa (apenas MASTER pode cancelar contrato)
    if (
      updateCompanyDto.status === SimpleStatus.INACTIVE && 
      currentUser.role !== UserRole.MASTER
    ) {
      throw new ForbiddenException('Apenas usuários Master podem inativar uma empresa.');
    }

    // 3. Sanitização de Dados
    if (updateCompanyDto.cnpj) {
      updateCompanyDto.cnpj = updateCompanyDto.cnpj.replace(/\D/g, '');
      
      // Opcional: Verificar se o novo CNPJ já existe em outra empresa (exceto a atual)
      if (updateCompanyDto.cnpj !== currentCompanyData.cnpj) {
         const exists = await this.prisma.company.findUnique({ 
             where: { cnpj: updateCompanyDto.cnpj } 
         });
         if (exists) throw new BadRequestException('Este CNPJ já está em uso por outra empresa.');
      }
    }

    // 4. Persistência com Resiliência
    const updated = await this.executeWithResilience('update_company', () =>
      this.prisma.company.update({
        where: { id },
        data: {
          ...updateCompanyDto,
          // Auditoria: Quem fez a alteração
          userUpdateId: currentUser.id,
          // Só atualiza status se foi enviado
          ...(updateCompanyDto.status && { status: updateCompanyDto.status }),
        },
      })
    );

    // 5. Invalidação de Cache
    // Remove o item específico
    await this.cacheManager.del(`company_${id}`);

    // Remove as listas para forçar atualização na listagem
    try {
      const store = (this.cacheManager as any).store;
      if (store && typeof store.keys === 'function') {
        // Padrão do Redis para buscar chaves
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

  /**
   * D - Soft Delete
   */
  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.executeWithResilience('soft_delete_company', () =>
      this.prisma.company.update({
        where: { id },
        data: {
          status: SimpleStatus.INACTIVE,
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