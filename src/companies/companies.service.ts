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
    fn: (signal: AbortSignal) => Promise<T>,
    retries = 3,
    timeoutMs = 5000,
  ): Promise<T> {
    const endTimer = this.dbHistogram.labels(operation).startTimer();
    let attempt = 0;

    while (attempt < retries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const result = await fn(controller.signal);
        clearTimeout(timeoutId);
        endTimer();
        return result;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        attempt++;

        const isAbort = error instanceof Error && (error.name === 'AbortError' || (error as any).code === 'P2008');

        if (attempt >= retries) {
          endTimer();
          this.logger.error(`Falha crítica em ${operation} após ${retries} tentativas.`);
          
          if (isAbort) throw new RequestTimeoutException(`Timeout na operação ${operation}`);
          throw error instanceof Error ? error : new InternalServerErrorException('Database Error');
        }

        const delay = (100 * Math.pow(2, attempt)) + (Math.random() * 50);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new InternalServerErrorException();
  }

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const existing = await this.prisma.company.findUnique({
      where: { cnpj: createCompanyDto.cnpj },
    });

    if (existing) throw new BadRequestException('Empresa já cadastrada com este CNPJ.');

    const company = await this.executeWithResilience('create_company', (signal) =>
      this.db.company.create({
        data: {
          ...createCompanyDto,
          status: createCompanyDto.status || SimpleStatus.ACTIVE,
        },
        ...( { signal } as any )
      }),
    );

    // ADICIONE ESTA LINHA:
    this.companyCounter.inc(); 

    return company;
  }

  async findAll(pagination: PaginationDto): Promise<PaginatedCompaniesResponse> {
    const { page = 1, limit = 10 } = pagination;
    const isMaster = this.cls.get<boolean>('isMaster');
    const tenantId = this.cls.get<string>('tenantId');

    const cacheKey = `list_${isMaster ? 'm' : 't_' + (tenantId ?? 'none')}_p${page}_l${limit}`;

    const cached = await this.cacheManager.get<PaginatedCompaniesResponse>(cacheKey);
    if (cached) return cached;

    const existingPromise = this.inFlightRequests.get(cacheKey);
    if (existingPromise) return existingPromise as Promise<PaginatedCompaniesResponse>;

    const fetchPromise = (async (): Promise<PaginatedCompaniesResponse> => {
      try {
        const result = await this.executeWithResilience('find_many_companies', async (signal) => {
          const skip = (page - 1) * limit;
          const where: any = { status: SimpleStatus.ACTIVE };

          if (!isMaster) {
            if (!tenantId) return { data: [], total: 0, page, lastPage: 0 };
            where.id = tenantId;
          }

          // Realizamos o cast para Number e Company[] para resolver o erro de "number | {}"
          const [data, totalRaw] = await Promise.all([
            this.db.company.findMany({
              skip, take: limit, where,
              orderBy: { name: 'asc' },
              select: {
                id: true, name: true, cnpj: true, email: true, status: true,
                telefone: true, endereco: true, numero: true, bairro: true,
                cidade: true, estado: true, cep: true, complemento: true,
              },
              ...({ signal } as any)
            }),
            this.db.company.count({ where, ...({ signal } as any) }),
          ]);

          const total = Number(totalRaw); // Garante que é um number

          return { 
            data: data as Partial<Company>[], 
            total, 
            page, 
            lastPage: Math.ceil(total / limit) 
          };
        });
        
        await this.cacheManager.set(cacheKey, result, 300000);
        return result;
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

    const company = await this.executeWithResilience('find_one_company', (signal) => 
      this.db.company.findUnique({ where: { id }, ...({ signal } as any) })
    ) as Company | null;

    if (!company) throw new NotFoundException(`Empresa não encontrada.`);

    await this.cacheManager.set(cacheKey, company, 600000);
    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    const current = await this.findOne(id);
    const isMaster = this.cls.get<boolean>('isMaster');

    if (!isMaster && (updateCompanyDto.status || updateCompanyDto.cnpj)) {
      throw new ForbiddenException('Permissão negada para alterar campos sensíveis.');
    }

    if (updateCompanyDto.cnpj && updateCompanyDto.cnpj !== current.cnpj) {
      const exists = await this.prisma.company.findUnique({ where: { cnpj: updateCompanyDto.cnpj } });
      if (exists) throw new BadRequestException('CNPJ já em uso.');
    }

    const updated = await this.executeWithResilience('update_company', (signal) =>
      this.db.company.update({ 
        where: { id }, 
        data: updateCompanyDto, 
        ...({ signal } as any) 
      })
    );

    await this.cacheManager.del(`company_${id}`);
    return updated as Company;
  }

  async remove(id: string): Promise<void> {
    if (!this.cls.get<boolean>('isMaster')) {
      throw new ForbiddenException('Apenas Masters podem inativar empresas.');
    }

    await this.findOne(id);

    await this.executeWithResilience('soft_delete_company', (signal) =>
      this.db.company.update({
        where: { id },
        data: { status: SimpleStatus.INACTIVE },
        ...({ signal } as any)
      })
    );

    await this.cacheManager.del(`company_${id}`);
  }
}