/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Cache } from 'cache-manager';
import { ClsService } from 'nestjs-cls';
import { Counter, Histogram } from 'prom-client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateCompanyDto,
  PaginationDto,
  UpdateCompanyDto,
} from './dto/create-company.dto';

export interface PaginatedCompaniesResponse {
  data: Partial<Company>[];
  total: number;
  page: number;
  lastPage: number;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly cls: ClsService,
    @InjectMetric('company_created_total')
    public companyCounter: Counter<string>,
    @InjectMetric('db_operation_duration_seconds')
    public dbHistogram: Histogram<string>,
  ) {}

  /**
   * Getter para utilizar o cliente Prisma estendido (com Multi-tenant e Auditoria).
   * Isso garante que todas as queries respeitem o tenantId do CLS.
   */
  private get db() {
    return this.prisma.extended;
  }

  /**
   * Wrapper de Resiliência com proteção contra vazamento de memória e Backoff Exponencial.
   */
  private async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>,
    retries = 3,
    timeoutMs = 5000,
  ): Promise<T> {
    const endTimer = this.dbHistogram.labels(operation).startTimer();
    let attempt = 0;

    while (attempt < retries) {
      let timeoutId: NodeJS.Timeout | undefined;
      try {
        const result = await Promise.race([
          fn(),
          new Promise((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('Timeout')),
              timeoutMs,
            );
          }),
        ]);
        if (timeoutId) clearTimeout(timeoutId);
        endTimer();
        return result as T;
      } catch (error: any) {
        if (timeoutId) clearTimeout(timeoutId);
        attempt++;
        this.logger.warn(
          `Tentativa ${attempt} falhou (${operation}): ${error.message}`,
        );

        if (attempt >= retries) {
          endTimer();
          this.logger.error(
            `Falha crítica em ${operation} após ${retries} tentativas.`,
          );
          throw error instanceof Error
            ? error
            : new InternalServerErrorException('Database Error');
        }
        await new Promise((res) => setTimeout(res, 100 * Math.pow(2, attempt)));
      }
    }
    throw new InternalServerErrorException();
  }

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    // CNPJ já chega sanitizado se você aplicou o @Transform no DTO
    // Usamos 'prisma' (base) aqui pois CNPJ é global e não deve colidir entre tenants
    const existing = await this.prisma.company.findUnique({
      where: { cnpj: createCompanyDto.cnpj },
    });

    if (existing)
      throw new BadRequestException('Empresa já cadastrada com este CNPJ.');

    const company = await this.executeWithResilience<Company>(
      'create_company',
      () =>
        this.db.company.create({
          data: {
            ...createCompanyDto,
            status: createCompanyDto.status || SimpleStatus.ACTIVE,
          },
        }),
    );

    this.companyCounter.inc();
    return company;
  }

async findAll(pagination: PaginationDto): Promise<PaginatedCompaniesResponse> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    // Chave de cache segmentada por perfil e paginação
    const cacheKey = `list_${isMaster ? 'm' : 't_' + tenantId}_p${page}_l${limit}`;
    const cached = await this.cacheManager.get<PaginatedCompaniesResponse>(cacheKey);
    
    if (cached) return cached;

    const where: any = { status: SimpleStatus.ACTIVE };

    // Se não for Master, a extensão do Prisma já aplicaria o filtro, 
    // mas reforçamos aqui para garantir a consistência da query.
    if (!isMaster) {
      if (!tenantId) return { data: [], total: 0, page, lastPage: 0 };
      where.id = tenantId;
    }

    // Execução paralela para melhor performance
    const [data, total] = await Promise.all([
      this.executeWithResilience<Partial<Company>[]>('find_many_companies', () =>
        this.db.company.findMany({
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
            // --- CAMPOS DE ENDEREÇO INCLUÍDOS ---
            endereco: true,
            numero: true,
            bairro: true,
            cidade: true,
            estado: true,
            cep: true,
            complemento: true,
          },
        }),
      ),
      this.executeWithResilience<number>('count_companies', () =>
        this.db.company.count({ where }),
      ),
    ]);

    const result: PaginatedCompaniesResponse = {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };

    // Salva no cache por 30 segundos
    await this.cacheManager.set(cacheKey, result, 30000);

    return result;
  }

  async findOne(id: string): Promise<Company> {
    const cacheKey = `company_${id}`;
    const cachedCompany = await this.cacheManager.get<Company>(cacheKey);
    if (cachedCompany) return cachedCompany;

    // A extensão do Prisma (this.db) já injeta automaticamente "where: { id: tenantId }"
    // se o usuário não for MASTER, impedindo acesso a IDs de terceiros.
    const company = await this.executeWithResilience<Company>(
      'find_one_company',
      () => this.db.company.findUnique({ where: { id } }),
    );

    if (!company) {
      throw new NotFoundException(`Empresa não encontrada ou acesso negado.`);
    }

    await this.cacheManager.set(cacheKey, company, 60000); // 1min
    return company;
  }

  async update(
    id: string,
    updateCompanyDto: UpdateCompanyDto,
  ): Promise<Company> {
    // 1. Verifica existência e autorização via findOne (que usa a extensão segura)
    const current = await this.findOne(id);
    const isMaster = this.cls.get<boolean>('isMaster');

    // 2. SEGURANÇA: Bloqueia alteração de status/cnpj por não-masters
    if (!isMaster && (updateCompanyDto.status || updateCompanyDto.cnpj)) {
      throw new ForbiddenException(
        'Apenas usuários Master podem alterar campos sensíveis.',
      );
    }

    // 3. Validação de duplicidade de CNPJ se houver alteração
    if (updateCompanyDto.cnpj && updateCompanyDto.cnpj !== current.cnpj) {
      const exists = await this.prisma.company.findUnique({
        where: { cnpj: updateCompanyDto.cnpj },
      });
      if (exists)
        throw new BadRequestException(
          'O novo CNPJ já está em uso por outra empresa.',
        );
    }

    const updated = await this.executeWithResilience<Company>(
      'update_company',
      () =>
        this.db.company.update({
          where: { id },
          data: updateCompanyDto,
        }),
    );

    await this.cacheManager.del(`company_${id}`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!this.cls.get<boolean>('isMaster')) {
      throw new ForbiddenException(
        'Apenas usuários Master podem inativar empresas.',
      );
    }

    // Confirma existência e acesso
    await this.findOne(id);

    await this.executeWithResilience('soft_delete_company', () =>
      this.db.company.update({
        where: { id },
        data: { status: SimpleStatus.INACTIVE },
      }),
    );

    await this.cacheManager.del(`company_${id}`);
  }
}
