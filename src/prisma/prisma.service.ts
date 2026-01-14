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
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private _extendedClient: any;
  private readonly logger = new Logger('PrismaExtension');

  constructor(private readonly cls: ClsService) {
    super({
      log: ['error'], 
    });
  }

  get extended() {
    if (!this._extendedClient) {
      const cls = this.cls;
      const logger = this.logger;

      this._extendedClient = this.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              try {
                const tenantId = cls.get('tenantId');
                const userId = cls.get('userId');
                const isMaster = cls.get('isMaster'); // Deve ser boolean

                // Models que são públicos ou globais
                const publicModels = ['Plan', 'Subscription', 'AuditLog']; 
                const safeArgs = (args as any) || {};

                // ============================================================
                // 1. AUDITORIA (Sempre roda se tiver usuário)
                // ============================================================
                if (userId) {
                  // Create / CreateMany
                  if (operation === 'create') {
                    if (!safeArgs.data) safeArgs.data = {};
                    (safeArgs.data as any).userCreateId = userId;
                    (safeArgs.data as any).userUpdateId = userId;
                  }
                  if (operation === 'createMany' && safeArgs.data) {
                    const list = Array.isArray(safeArgs.data) ? safeArgs.data : [safeArgs.data];
                    list.forEach((item: any) => item.userCreateId = userId);
                  }
                  // Update / Upsert
                  if (['update', 'updateMany', 'upsert'].includes(operation)) {
                     if (operation !== 'upsert' && !safeArgs.data) safeArgs.data = {};
                     if (operation === 'upsert') {
                        if (!safeArgs.create) safeArgs.create = {};
                        if (!safeArgs.update) safeArgs.update = {};
                        (safeArgs.create as any).userCreateId = userId;
                        (safeArgs.create as any).userUpdateId = userId;
                        (safeArgs.update as any).userUpdateId = userId;
                     } else {
                        (safeArgs.data as any).userUpdateId = userId;
                     }
                  }
                }

                // ============================================================
                // 2. MULTITENANT (AQUI ESTAVA O PROBLEMA)
                // ============================================================
                
                // Se for Master, NÃO aplica filtro de tenant. Ponto final.
                if (isMaster) {
                    // Log apenas para debug se for criação de usuário
                    if (model === 'User' && operation === 'create') {
                        logger.log(`👑 [Prisma] Master operando em ${model}.${operation}. Mantendo companyId original: ${(safeArgs.data as any)?.companyId}`);
                    }
                    return await query(safeArgs);
                }

                // Se não for Master, e tiver Tenant, e não for model público
                if (tenantId && !publicModels.includes(model)) {
                  
                  // CREATE: Força o ID da empresa do usuário logado
                  if (operation === 'create') {
                     if (!safeArgs.data) safeArgs.data = {};
                     
                     // Se for User criando outro User (Admin criando Colaborador)
                     // O Admin SÓ pode criar na empresa dele.
                     // Mas se o Service já mandou o ID certo, a gente garante aqui.
                     safeArgs.data.companyId = tenantId;
                     
                     // Remove connect para evitar conflito
                     if (safeArgs.data.company) delete safeArgs.data.company;
                  }

                  // CREATE MANY
                  if (operation === 'createMany' && safeArgs.data) {
                     const list = Array.isArray(safeArgs.data) ? safeArgs.data : [safeArgs.data];
                     list.forEach((item: any) => item.companyId = tenantId);
                  }

                  // READ / UPDATE / DELETE (Filtra pelo tenant)
                  const operationsWithWhere = [
                    'findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow', 
                    'count', 'update', 'updateMany', 'delete', 'deleteMany', 
                    'aggregate', 'groupBy'
                  ];

                  if (operationsWithWhere.includes(operation)) {
                    if (!safeArgs.where) safeArgs.where = {};
                    
                    // Injeta filtro de segurança
                    safeArgs.where.companyId = tenantId;

                    // Ajuste findUnique -> findFirst
                    if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                      if (operation === 'findUnique') return (this as any)[model].findFirst(safeArgs);
                      return (this as any)[model].findFirstOrThrow(safeArgs);
                    }
                  }
                }

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

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}