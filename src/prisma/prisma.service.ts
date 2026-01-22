/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

/**
 * @class PrismaService
 * @extends PrismaClient
 * @description Serviço responsável pela conexão com o banco de dados e gerenciamento de permissões Multi-tenant.
 * Utiliza o Prisma Client Extensions para injetar automaticamente filtros de segurança e auditoria.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private _extendedClient: any;
  private readonly logger = new Logger('PrismaExtension');

  constructor(private readonly cls: ClsService) {
    super({
      log: ['error'], // Configurado para logar apenas erros críticos por padrão
    });
  }

  /**
   * @property extended
   * @description Retorna uma instância do Prisma configurada com middlewares de segurança (Extensions).
   * * As extensões aplicam automaticamente:
   * 1. **Auditoria**: Injeção de `userCreateId` e `userUpdateId`.
   * 2. **Multi-tenancy**: Filtro automático por `companyId` para garantir isolamento de dados.
   * 3. **Segurança Master**: Bypass de filtros para usuários com nível de acesso Master.
   */
  get extended() {
    if (!this._extendedClient) {
      const cls = this.cls;
      const logger = this.logger;

      this._extendedClient = this.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              try {
                // Recupera dados do contexto da requisição atual (via CLS)
                const tenantId = cls.get('tenantId');
                const userId = cls.get('userId');
                const isMaster = cls.get('isMaster');

                // Modelos que não possuem vínculo com empresa ou são dados globais
                const publicModels = ['Plan', 'Subscription'];
                const safeArgs = (args as any) || {};

                /**
                 * ============================================================
                 * 1. LÓGICA DE AUDITORIA AUTOMÁTICA
                 * ============================================================
                 * Adiciona automaticamente quem criou ou editou o registro.
                 */
                if (userId) {
                  // Operações de criação
                  if (operation === 'create') {
                    if (!safeArgs.data) safeArgs.data = {};
                    safeArgs.data.userCreateId = userId;
                    safeArgs.data.userUpdateId = userId;
                  }
                  
                  // Criação em lote
                  if (operation === 'createMany' && safeArgs.data) {
                    const list = Array.isArray(safeArgs.data) ? safeArgs.data : [safeArgs.data];
                    list.forEach((item: any) => item.userCreateId = userId);
                  }

                  // Operações de atualização e Upsert
                  if (['update', 'updateMany', 'upsert'].includes(operation)) {
                    if (operation === 'upsert') {
                      if (!safeArgs.create) safeArgs.create = {};
                      if (!safeArgs.update) safeArgs.update = {};
                      safeArgs.create.userCreateId = userId;
                      safeArgs.create.userUpdateId = userId;
                      safeArgs.update.userUpdateId = userId;
                    } else {
                      if (!safeArgs.data) safeArgs.data = {};
                      safeArgs.data.userUpdateId = userId;
                    }
                  }
                }

                /**
                 * ============================================================
                 * 2. LÓGICA MULTI-TENANT (ISOLAMENTO DE EMPRESAS)
                 * ============================================================
                 * Garante que um usuário de uma empresa não acesse dados de outra.
                 */
                
                // Regra de Ouro: Usuários Master ignoram qualquer trava de Tenant
                if (isMaster) {
                  return await query(safeArgs);
                }

                // Aplica isolamento se houver um tenantId e o modelo não for público
                if (tenantId && !publicModels.includes(model)) {
                  
                  /**
                   * CREATE: Bloqueia injeção de IDs falsos.
                   * Força o companyId do objeto a ser o mesmo do usuário logado.
                   */
                  if (operation === 'create' && model !== 'Company') {
                    if (!safeArgs.data) safeArgs.data = {};
                    safeArgs.data.companyId = tenantId;
                    if (safeArgs.data.company) delete safeArgs.data.company;
                  }

                  /**
                   * READ / UPDATE / DELETE: Injeção de cláusula WHERE.
                   * Adiciona 'companyId: tenantId' em todas as buscas de forma invisível.
                   */
                  const operationsWithWhere = [
                    'findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow',
                    'count', 'update', 'updateMany', 'delete', 'deleteMany',
                    'aggregate', 'groupBy'
                  ];

                  if (operationsWithWhere.includes(operation)) {
                    if (!safeArgs.where) safeArgs.where = {};

                    /**
                     * Tratamento de exceção para o modelo Company:
                     * Em modelos comuns (ex: Produtos), filtramos por 'companyId'.
                     * No modelo Company, a empresa é o próprio registro, então filtramos por 'id'.
                     */
                    if (model === 'Company') {
                      safeArgs.where.id = tenantId;
                    } else {
                      safeArgs.where.companyId = tenantId;
                    }

                    /**
                     * Conversão de findUnique para findFirst:
                     * O Prisma não permite filtros extras em findUnique (apenas IDs primários).
                     * Convertendo para findFirst, conseguimos aplicar o filtro de segurança (tenantId).
                     */
                    if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                      if (operation === 'findUnique') return (this as any)[model].findFirst(safeArgs);
                      return (this as any)[model].findFirstOrThrow(safeArgs);
                    }
                  }
                }

                // Executa a query final com todos os filtros injetados
                return await query(safeArgs);

              } catch (error) {
                logger.error(`💥 [Prisma Fatal Error] Falha em ${model}.${operation}`, error);
                throw error;
              }
            },
          },
        },
      });
    }
    return this._extendedClient;
  }

  /**
   * Ciclo de vida: Conecta ao banco quando o módulo inicia.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Ciclo de vida: Desconecta do banco quando o módulo é destruído.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}