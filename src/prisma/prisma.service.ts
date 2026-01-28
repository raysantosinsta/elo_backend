/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private _extendedClient: any;
  private readonly logger = new Logger('PrismaService'); // Mudei o nome para facilitar

  constructor(private readonly cls: ClsService) {
    super({
      log: ['error'],
    });
  }

  get extended() {
    if (!this._extendedClient) {
      const cls = this.cls;
      const logger = this.logger;
      const prismaContext = this;

      this._extendedClient = this.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              try {
                const tenantId = cls.get('tenantId');
                const userId = cls.get('userId');
                const isMaster = cls.get('isMaster');
                const publicModels = ['Plan', 'Subscription'];
                const safeArgs = (args as any) || {};

                // --- 1. AUDITORIA ---
                if (userId) {
                  if (operation === 'create') {
                    if (!safeArgs.data) safeArgs.data = {};
                    safeArgs.data.userCreateId = userId;
                    safeArgs.data.userUpdateId = userId;
                  }
                  if (operation === 'createMany' && safeArgs.data) {
                    const list = Array.isArray(safeArgs.data) ? safeArgs.data : [safeArgs.data];
                    list.forEach((item: any) => item.userCreateId = userId);
                  }
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

                // --- 2. MULTI-TENANT ---
                if (isMaster) return await query(safeArgs);

                if (tenantId && !publicModels.includes(model)) {
                  if (operation === 'create' && model !== 'Company') {
                    if (!safeArgs.data) safeArgs.data = {};
                    safeArgs.data.companyId = tenantId;
                    if (safeArgs.data.company) delete safeArgs.data.company;
                  }

                  const operationsWithWhere = [
                    'findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow',
                    'count', 'update', 'updateMany', 'delete', 'deleteMany',
                    'aggregate', 'groupBy'
                  ];

                  if (operationsWithWhere.includes(operation)) {
                    if (!safeArgs.where) safeArgs.where = {};

                    if (model === 'Company') safeArgs.where.id = tenantId;
                    else safeArgs.where.companyId = tenantId;

                    // --- CONVERSÃO FIND UNIQUE -> FIND FIRST ---
                    if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                      const camelCaseModel = model.charAt(0).toLowerCase() + model.slice(1);
                      const delegate = (prismaContext as any)[camelCaseModel];

                      if (!delegate) {
                        logger.error(`FATAL: Delegate '${camelCaseModel}' não existe no PrismaClient.`);
                        throw new Error(`Delegate '${camelCaseModel}' não encontrado. Execute 'npx prisma generate'.`);
                      }

                      if (operation === 'findUnique') return delegate.findFirst(safeArgs);
                      return delegate.findFirstOrThrow(safeArgs);
                    }
                  }
                }

                return await query(safeArgs);
              } catch (error) {
                logger.error(`Erro em ${model}.${operation}:`, error);
                throw error;
              }
            },
          },
        },
      });
    }
    return this._extendedClient;
  }

  async onModuleInit() {
    await this.$connect();
    
    // --- DIAGNÓSTICO AO INICIAR ---
    // Isso vai listar no console quais tabelas o Prisma carregou.
    // Se "material" não aparecer aqui, o generate falhou.
    const availableModels = Object.getOwnPropertyNames(this)
      .filter(key => !key.startsWith('_') && !key.startsWith('$'));
      
    // Truque para ver propriedades no Prototype (onde os delegates realmente vivem)
    const prototypeProps = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
       .filter(key => !key.startsWith('_') && !key.startsWith('$') && key !== 'constructor');

    this.logger.log(`✅ Prisma conectado. Models disponíveis: [${[...availableModels, ...prototypeProps].join(', ')}]`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}