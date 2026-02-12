/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { Company, SimpleStatus } from '@prisma/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Cache } from 'cache-manager';
import { ClsService } from 'nestjs-cls';
import { Counter, Histogram } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
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

  // Tipagem correta para evitar Promise<any>
  private inFlightRequests = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly cls: ClsService,
    @InjectMetric('company_created_total')
    public companyCounter: Counter<string>,
    @InjectMetric('db_operation_duration_seconds')
    public dbHistogram: Histogram<string>,
  ) {}

  private get db() {
    return this.prisma.extended;
  }

  private async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>, // ← sem signal
    retries = 3,
    timeoutMs = 30000, // aumentei para 30s como fallback, ajuste depois
  ): Promise<T> {
    const endTimer = this.dbHistogram.labels(operation).startTimer();
    let attempt = 0;

    while (attempt < retries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // Execute a fn sem passar signal
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            controller.signal.addEventListener('abort', () =>
              reject(new Error('Aborted by timeout')),
            ),
          ),
        ]);
        clearTimeout(timeoutId);
        endTimer();
        return result;
      } catch (error: any) {
        clearTimeout(timeoutId);

        // Seu log detalhado aqui (mantenha!)
        const errorInfo = {
          /* ... seu log ... */
        };
        this.logger.error(
          `[executeWithResilience] Falha na tentativa ${attempt}/${retries}`,
          errorInfo,
        );

        const isTimeout =
          error.name === 'AbortError' ||
          String(error.message).includes('timeout');

        if (attempt >= retries) {
          endTimer();
          this.logger.error(
            `Falha crítica em ${operation} após ${retries} tentativas.`,
            errorInfo,
          );
          if (isTimeout) {
            throw new RequestTimeoutException(
              `Timeout na operação ${operation} após ${retries} tentativas`,
            );
          }
          throw error;
        }

        const delay = 100 * Math.pow(2, attempt) + Math.random() * 80;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw new InternalServerErrorException(
      'Retry loop finalizado inesperadamente',
    );
  }

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const existing = await this.prisma.company.findUnique({
      where: { cnpj: createCompanyDto.cnpj },
    });

    if (existing)
      throw new BadRequestException('Empresa já cadastrada com este CNPJ.');

    const company = await this.executeWithResilience(
      'create_company',
      async () => {
        // ← sem parâmetro signal
        return this.db.company.create({
          data: {
            ...createCompanyDto,
            status: createCompanyDto.status || SimpleStatus.ACTIVE,
          },
          // NÃO passe { signal } aqui! Prisma não suporta AbortSignal nos argumentos
        });
      },
      3, // retries (opcional, pode manter o default)
      30000, // timeoutMs em milissegundos (recomendo 30s ou mais para create em supabase)
    );

    // ADICIONE ESTA LINHA:
    this.companyCounter.inc();

    return company;
  }

  async findAll(
    pagination: PaginationDto,
  ): Promise<PaginatedCompaniesResponse> {
    const { page = 1, limit = 10 } = pagination;
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    const cacheKey = `list_${isMaster ? 'm' : 't_' + (tenantId ?? 'none')}_p${page}_l${limit}`;

    const cached =
      await this.cacheManager.get<PaginatedCompaniesResponse>(cacheKey);
    if (cached) return cached;

    const existingPromise = this.inFlightRequests.get(cacheKey);
    if (existingPromise)
      return existingPromise as Promise<PaginatedCompaniesResponse>;

    const fetchPromise = (async (): Promise<PaginatedCompaniesResponse> => {
      try {
        // Aumentamos o timeout para 15 segundos para evitar falsos positivos de lentidão
        return await this.executeWithResilience(
          'find_many_companies',
          async () => {
            // ← sem (signal)
            const skip = (page - 1) * limit;
            const where: any = { status: SimpleStatus.ACTIVE };

            if (!isMaster) {
              if (!tenantId) return { data: [], total: 0, page, lastPage: 0 };
              where.id = tenantId;
            }

            // Execução sequencial (count depois do findMany) continua sendo uma boa prática
            const data = (await this.db.company.findMany({
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
                endereco: true,
                numero: true,
                complemento: true,
                bairro: true,
                cidade: true,
                estado: true,
                cep: true,
              },
              // NÃO passe signal aqui
            })) as Partial<Company>[];

            const totalRaw = await this.db.company.count({
              where,
              // NÃO passe signal aqui também
            });

            const total = Number(totalRaw);

            const result = {
              data,
              total,
              page,
              lastPage: Math.ceil(total / limit),
            };

            // Cache por 5 minutos (300000 ms)
            await this.cacheManager.set(cacheKey, result, 300000);

            return result;
          },
          3, // número de tentativas
          30000, // Timeout de 30 segundos por tentativa (recomendado para Supabase + pooler)
        );
      } finally {
        this.inFlightRequests.delete(cacheKey);
      }
    })();

    this.inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  async findOne(id: string): Promise<Company> {
    const cacheKey = `company_${id}`;

    const cached = await this.cacheManager.get<Company>(cacheKey);
    if (cached) return cached;

    const company = (await this.executeWithResilience(
      'find_one_company',
      async () =>
        this.db.company.findUnique({
          where: { id },
        }),
      3,
      20000,
    )) as Company | null;

    if (!company) throw new NotFoundException(`Empresa não encontrada.`);

    await this.cacheManager.set(cacheKey, company, 600000);
    return company;
  }

  async update(
    id: string,
    updateCompanyDto: UpdateCompanyDto,
  ): Promise<Company> {
    const current = await this.findOne(id);
    const isMaster = this.cls.get<boolean>('isMaster');

    if (!isMaster && (updateCompanyDto.status || updateCompanyDto.cnpj)) {
      throw new ForbiddenException(
        'Permissão negada para alterar campos sensíveis.',
      );
    }

    if (updateCompanyDto.cnpj && updateCompanyDto.cnpj !== current.cnpj) {
      const exists = await this.prisma.company.findUnique({
        where: { cnpj: updateCompanyDto.cnpj },
      });
      if (exists) throw new BadRequestException('CNPJ já em uso.');
    }

    const updated = await this.executeWithResilience(
      'update_company',
      async () =>
        this.db.company.update({
          where: { id },
          data: updateCompanyDto,
        }),
      3,
      20000,
    );

    await this.cacheManager.del(`company_${id}`);
    return updated as Company;
  }

  async remove(id: string): Promise<void> {
    if (!this.cls.get<boolean>('isMaster')) {
      throw new ForbiddenException('Apenas Masters podem inativar empresas.');
    }

    await this.findOne(id);

    await this.executeWithResilience(
      'soft_delete_company',
      async () =>
        this.db.company.update({
          where: { id },
          data: { status: SimpleStatus.INACTIVE },
        }),
      3,
      20000,
    );

    await this.cacheManager.del(`company_${id}`);
  }
}
