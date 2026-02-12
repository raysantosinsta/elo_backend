/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private _extendedClient: any;
  private readonly logger = new Logger('PrismaService');

  constructor(private readonly cls: ClsService) {
    super({ log: ['error'] });
  }

  get extended() {
    if (!this._extendedClient) {
      const cls = this.cls;
      const prismaContext = this;

      this._extendedClient = this.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              const tenantId = cls.get<string>('tenantId');
              const userId = cls.get<string>('userId');
              const isMaster = cls.get<boolean>('isMaster');
              const publicModels = ['Plan', 'Subscription'];
              const safeArgs = (args as any) || {};

              // --- 1. AUDITORIA AUTOMÁTICA ---
              if (userId) {
                if (operation === 'create') {
                  safeArgs.data = { ...safeArgs.data, userCreateId: userId, userUpdateId: userId };
                } else if (['update', 'updateMany', 'upsert'].includes(operation)) {
                  if (operation === 'upsert') {
                    safeArgs.create = { ...safeArgs.create, userCreateId: userId, userUpdateId: userId };
                    safeArgs.update = { ...safeArgs.update, userUpdateId: userId };
                  } else {
                    safeArgs.data = { ...safeArgs.data, userUpdateId: userId };
                  }
                }
              }

              // --- 2. MULTI-TENANT PROTECTION ---
              // Se for Master, ignora filtros de Tenant
              if (isMaster) return query(safeArgs);

              // Se não for Master e o modelo não for público, injeta o filtro
              if (tenantId && !publicModels.includes(model)) {
                
                // Injeção de Segurança em Escritas (Update/Delete) e Leituras
                const operationsWithWhere = [
                  'findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow',
                  'count', 'update', 'updateMany', 'delete', 'deleteMany',
                  'aggregate', 'groupBy'
                ];

                if (operationsWithWhere.includes(operation)) {
                  safeArgs.where = safeArgs.where || {};
                  
                  // Se o modelo for 'Company', o filtro é no ID (o tenant só vê a si mesmo)
                  // Se for outro modelo, o filtro é no campo 'companyId'
                  if (model === 'Company') {
                    safeArgs.where.id = tenantId;
                  } else {
                    safeArgs.where.companyId = tenantId;
                  }

                  // --- CONVERSÃO FIND UNIQUE -> FIND FIRST ---
                  // Prisma findUnique exige campos @unique. Ao injetar o tenantId, 
                  // a query deixa de ser um unique puro. Convertemos para findFirst.
                  if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                    const camelCaseModel = model.charAt(0).toLowerCase() + model.slice(1);
                    const delegate = (prismaContext as any)[camelCaseModel];
                    
                    if (operation === 'findUnique') return delegate.findFirst(safeArgs);
                    return delegate.findFirstOrThrow(safeArgs);
                  }
                }

                // Injeção de Segurança no Create (vincula ao tenant atual)
                if (operation === 'create' && model !== 'Company') {
                  safeArgs.data = { ...safeArgs.data, companyId: tenantId };
                }
              }

              return query(safeArgs);
            },
          },
        },
      });
    }
    return this._extendedClient;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Prisma connected with Multi-tenant Extension active.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}