/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unused-vars */
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
  RequestTimeoutException,
} from '@nestjs/common';
import { Company, SimpleStatus, UserRole } from '@prisma/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Cache } from 'cache-manager';
import { ClsService } from 'nestjs-cls';
import { Counter, Histogram } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCompanyDto,
  PaginationDto,
  UpdateCompanyDto,
  UpdateNotificationSettingsDto,
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
    fn: () => Promise<T>,
    retries = 3,
    timeoutMs = 30000,
  ): Promise<T> {
    const endTimer = this.dbHistogram.labels(operation).startTimer();
    let attempt = 0;

    while (attempt < retries) {
      attempt++;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        this.logger.warn(
          `[Timeout] Operação ${operation} abortada após ${timeoutMs}ms (tentativa ${attempt}/${retries})`,
        );
      }, timeoutMs);

      try {
        const result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            controller.signal.addEventListener('abort', () => {
              reject(new Error(`Timeout após ${timeoutMs}ms`));
            }),
          ),
        ]);

        clearTimeout(timeoutId);
        endTimer();
        return result;
      } catch (rawError: unknown) {
        clearTimeout(timeoutId);

        // LOG DETALHADO
        const errorInfo: Record<string, any> = {
          attempt,
          retries,
          operation,
          timeoutMs,
          errorType: typeof rawError,
          isError: rawError instanceof Error,
          errorString: String(rawError),
        };

        if (rawError instanceof Error) {
          errorInfo.name = rawError.name;
          errorInfo.message = rawError.message;
          errorInfo.stack = rawError.stack?.split('\n').slice(0, 6).join('\n');
        } else if (rawError !== null && typeof rawError === 'object') {
          errorInfo.objectKeys = Object.keys(rawError);
          errorInfo.code = (rawError as any).code;
          errorInfo.meta = (rawError as any).meta;
        }

        this.logger.error(
          `[executeWithResilience] Falha na tentativa ${attempt}/${retries}`,
          errorInfo,
        );

        // DETECÇÃO ROBUSTA DE TIMEOUT
        const isTimeout =
          (rawError instanceof Error && rawError.name === 'AbortError') ||
          (rawError instanceof Error &&
            String(rawError.message || '')
              .toLowerCase()
              .includes('timeout')) ||
          String(rawError).toLowerCase().includes('timeout') ||
          String(rawError).toLowerCase().includes('abort') ||
          // Códigos Prisma de timeout
          (rawError &&
            typeof rawError === 'object' &&
            (rawError as any).code === 'P2024') || // pool timeout
          (rawError &&
            typeof rawError === 'object' &&
            (rawError as any).code === 'P1008') || // operation timeout
          (rawError &&
            typeof rawError === 'object' &&
            String((rawError as any).message || '')
              .toLowerCase()
              .includes('timeout'));

        if (attempt >= retries) {
          endTimer();

          this.logger.error(
            `Falha crítica em ${operation} após ${retries} tentativas`,
            errorInfo,
          );

          if (isTimeout) {
            throw new RequestTimeoutException(
              `Timeout na operação ${operation} após ${retries} tentativas (${timeoutMs}ms cada)`,
            );
          }

          if (rawError instanceof Error) {
            throw rawError;
          } else {
            throw new InternalServerErrorException(
              `Erro desconhecido em ${operation}: ${String(rawError || 'sem detalhes')}`,
            );
          }
        }

        const delay = 100 * Math.pow(2, attempt) + Math.random() * 150;
        this.logger.debug(
          `Aguardando ~${Math.round(delay)}ms antes da tentativa ${attempt + 1}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    endTimer();
    throw new InternalServerErrorException(
      `Loop de retry finalizado inesperadamente em ${operation}`,
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
        return this.db.company.create({
          data: {
            ...createCompanyDto,
            status: createCompanyDto.status || SimpleStatus.ACTIVE,
          },
        });
      },
      3,
      30000,
    );

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
        return await this.executeWithResilience(
          'find_many_companies',
          async () => {
            const skip = (page - 1) * limit;
            const where: any = { status: SimpleStatus.ACTIVE };

            if (!isMaster) {
              if (!tenantId) return { data: [], total: 0, page, lastPage: 0 };
              where.id = tenantId;
            }

            // 🔥 USAR this.prisma (não this.db) para Company
            const data = await this.prisma.company.findMany({
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
            });

            const total = await this.prisma.company.count({ where });

            const result = {
              data,
              total,
              page,
              lastPage: Math.ceil(total / limit),
            };

            await this.cacheManager.set(cacheKey, result, 300000);
            return result;
          },
          3,
          30000,
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

    // 🔥 USAR this.prisma (não this.db) para Company
    const company = (await this.executeWithResilience(
      'find_one_company',
      async () =>
        this.prisma.company.findUnique({
          // ← this.prisma, não this.db
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

    // if (!isMaster && (updateCompanyDto.status || updateCompanyDto.cnpj)) {
    //   throw new ForbiddenException(
    //     'Permissão negada para alterar campos sensíveis.',
    //   );
    // }

    if (updateCompanyDto.cnpj && updateCompanyDto.cnpj !== current.cnpj) {
      const exists = await this.prisma.company.findUnique({
        where: { cnpj: updateCompanyDto.cnpj },
      });
      if (exists) throw new BadRequestException('CNPJ já em uso.');
    }

    // 🔥 USAR this.prisma (não this.db) para Company
    const updated = await this.executeWithResilience(
      'update_company',
      async () =>
        this.prisma.company.update({
          // ← this.prisma, não this.db
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

  // ===========================================================================
  // 🔥 MÉTODOS CORRIGIDOS PARA NOTIFICAÇÕES
  // ===========================================================================

  async getNotificationSettings(
    id: string,
  ): Promise<{ notificationDays: number }> {
    await this.validateCompanyAccess(id);

    // 🔥 USAR this.prisma (não this.db) para Company
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: { notificationDays: true },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    return {
      notificationDays: company.notificationDays,
    };
  }

  async updateNotificationSettings(
    id: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<Partial<Company>> {
    await this.validateCompanyAccess(id);

    if (dto.notificationDays < 1 || dto.notificationDays > 90) {
      throw new BadRequestException('O valor deve estar entre 1 e 90 dias');
    }

    const userId = this.cls.get<string>('userId');

    // 🔥 USAR this.prisma (não this.db) para Company
    const updatedCompany = await this.prisma.company.update({
      where: { id },
      data: {
        notificationDays: dto.notificationDays,
        userUpdateId: userId,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        notificationDays: true,
        updatedAt: true,
      },
    });

    // Limpar cache
    await this.cacheManager.del(`company_${id}`);

    return updatedCompany;
  }

  /**
   * 🔥 MÉTODO DE VALIDAÇÃO CORRIGIDO - USANDO CLS
   */
  private async validateCompanyAccess(companyId: string): Promise<void> {
    // 🔥 Pega os dados do CLS (configurados pelo TenantInterceptor)
    const userRole = this.cls.get<string>('userRole') as UserRole;
    const userTenantId = this.cls.get<string>('tenantId');
    const isMaster = this.cls.get<boolean>('isMaster');
    const userId = this.cls.get<string>('userId');

    // Log para debug
    console.log('🔍 [validateCompanyAccess]', {
      companyId,
      userRole,
      userTenantId,
      isMaster,
      userId,
    });

    // MASTER pode acessar qualquer empresa
    if (userRole === UserRole.MASTER || isMaster) {
      console.log('✅ MASTER - acesso permitido');
      return;
    }

    // ADMIN só pode acessar sua própria empresa
    if (userRole === UserRole.ADMIN) {
      if (userTenantId !== companyId) {
        console.log('❌ ADMIN - empresa diferente', {
          userTenantId,
          requestedCompanyId: companyId,
        });
        throw new ForbiddenException(
          'Você não tem permissão para acessar os dados desta empresa',
        );
      }
      console.log('✅ ADMIN - acesso permitido (própria empresa)');
      return;
    }

    // Outros roles não têm acesso
    console.log('❌ Role não autorizado:', userRole);
    throw new ForbiddenException('Acesso negado');
  }
}
