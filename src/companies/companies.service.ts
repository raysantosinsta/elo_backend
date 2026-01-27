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
import { ClsService } from 'nestjs-cls';
// 🔥 IMPORTS NOVOS
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCompanyDto, PaginationDto, UpdateCompanyDto } from './dto/create-company.dto';





@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly cls: ClsService,
    // 🔥 INJEÇÃO DAS MÉTRICAS AQUI
    @InjectMetric('company_created_total')
    public companyCounter: Counter<string>,

    @InjectMetric('db_operation_duration_seconds')
    public dbHistogram: Histogram<string>,
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

  /**
   * Executa uma operação assíncrona com estratégias de resiliência (Retry + Timeout + Métricas).
   * * Este método envolve ("wraps") uma chamada ao banco de dados ou serviço externo para garantir que:
   * 1. Se demorar demais, o processo é abortado (Timeout).
   * 2. Se falhar, ele tenta novamente algumas vezes (Retry).
   * 3. O tempo de execução é monitorado para o Prometheus (Observability).
   * * @template T - O tipo de dado que a função `fn` retorna (ex: Company, User, void).
   * @param operation - Nome da operação (string) usado como label (etiqueta) nas métricas do Prometheus e nos logs (ex: 'create_company').
   * @param fn - A função assíncrona que executa a lógica real (ex: `() => this.prisma.company.create(...)`).
   * @param retries - (Opcional) Número máximo de tentativas em caso de erro. Padrão: 3.
   * @param timeoutMs - (Opcional) Tempo máximo em milissegundos que cada tentativa pode levar antes de ser abortada. Padrão: 5000ms (5s).
   * @returns Retorna o resultado da função `fn` (do tipo T) se for bem-sucedida.
   * @throws InternalServerErrorException - Se todas as tentativas falharem ou ocorrer timeout repetidamente.
   */
  private async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>,
    retries = 3,
    timeoutMs = 5000
  ): Promise<T> {
    
    // 1. INÍCIO DA METRIFICAÇÃO
    // Inicia um cronômetro no Histograma do Prometheus injetado (`this.dbHistogram`).
    // O método `.labels(operation)` categoriza essa métrica com o nome da operação passada.
    // O retorno `endTimer` é uma função que deve ser chamada quando a operação terminar para calcular a duração total.
    const endTimer = this.dbHistogram.labels(operation).startTimer();

    // 2. CONTADOR DE TENTATIVAS
    // Inicializa a variável de controle para o loop de tentativas. Começa em 0.
    let attempt = 0;

    // 3. LOOP DE RETRY (TENTATIVAS)
    // Entra num laço que continuará rodando enquanto o número de tentativas atuais (`attempt`)
    // for menor que o limite configurado (`retries`).
    while (attempt < retries) {
      try {
        // 4. CORRIDA CONTRA O TEMPO (TIMEOUT)
        // O `Promise.race` aceita um array de Promises e retorna o resultado daquela que finalizar primeiro (seja sucesso ou erro).
        // Aqui colocamos duas "corredoras":
        //   A: A função real (`fn()`) que queremos executar.
        //   B: Um temporizador (`setTimeout`) que rejeita a promessa com um erro 'Timeout' após `timeoutMs`.
        const result = await Promise.race([
          fn(), // A: Tenta executar a operação.
          new Promise((_, reject) =>
            // B: Cria uma "bomba relógio" que falha se o tempo expirar.
            setTimeout(() => reject(new Error('Timeout')), timeoutMs),
          ),
        ]);

        // 5. SUCESSO
        // Se `fn()` terminar antes do timeout e sem erros, o código chega aqui.
        // Paramos o cronômetro do Prometheus para registrar quanto tempo levou o sucesso.
        endTimer();

        // Retorna o resultado obtido para quem chamou o método. O loop é encerrado aqui.
        return result as T;

      } catch (error: any) {
        // 6. TRATAMENTO DE ERRO (FALHA OU TIMEOUT)
        // Se `fn()` falhar ou se o `timeout` estourar primeiro, caímos aqui.
        
        // Incrementa o contador de tentativas realizadas.
        attempt++;

        // Loga um aviso (Warn) no console informando que a tentativa X falhou e o motivo.
        // Isso não é um erro crítico ainda, pois vamos tentar de novo (se houver tentativas sobrando).
        this.logger.warn(`Tentativa ${attempt} falhou para ${operation}: ${error.message}`);

        // 7. VERIFICAÇÃO DE FALHA FINAL
        // Verifica se já esgotamos todas as tentativas permitidas.
        if (attempt >= retries) {
          // Se esgotou:
          // Para o cronômetro do Prometheus (registra o tempo total gasto até a falha final).
          endTimer();

          // Loga um erro crítico (Error) informando que a operação falhou definitivamente.
          this.logger.error(`Falha crítica em ${operation} após ${retries} tentativas.`);

          // Lança a exceção para o Controller/Frontend.
          // Se o erro original for conhecido, repassa ele. Se não, lança um erro genérico de banco.
          throw error instanceof Error ? error : new InternalServerErrorException('Database unavailable');
        }

        // 8. BACKOFF EXPONENCIAL (ESPERA INTELIGENTE)
        // Se ainda temos tentativas sobrando, não tentamos imediatamente para não sobrecarregar o banco.
        // Esperamos um tempo calculado pela fórmula: 100ms * 2 elevado à potência da tentativa atual.
        // Ex:
        //   Tentativa 1: espera 200ms
        //   Tentativa 2: espera 400ms
        //   Tentativa 3: espera 800ms...
        await new Promise((res) => setTimeout(res, 100 * Math.pow(2, attempt)));
      }
    }

    // 9. FAILSAFE (SEGURANÇA DE CÓDIGO)
    // Teoricamente inalcançável, pois o `throw` dentro do `if (attempt >= retries)` deve interromper o fluxo.
    // Mas o TypeScript exige um retorno ou throw no final da função caso o loop termine sem return.
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
    // 🔥 Uso da métrica injetada
    this.companyCounter.inc();

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