/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private _extendedClient: any;

  constructor(private readonly cls: ClsService) {
    super({
      log: ['warn', 'error'],
      errorFormat: 'minimal',
    });
  }

  get extended() {
    if (!this._extendedClient) {
      // Captura o CLS no escopo externo
      const cls = this.cls; 

      this._extendedClient = this.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              // 1. Recupera Contexto
              const tenantId = cls.get('tenantId');
              const isMaster = cls.get('isMaster');
              const userId = cls.get('userId');

              // 🔥 O SEGREDO ESTÁ AQUI: Cast para 'any' para permitir injeção dinâmica
              const safeArgs = args as any;

              // Lista de modelos que NÃO devem sofrer injeção automática de tenant
              // (Geralmente tabelas de configuração global ou logs puros)
              const publicModels = ['Plan', 'Subscription']; 

              // ============================================================
              // 1. AUDITORIA AUTOMÁTICA (User ID)
              // ============================================================
              if (userId) {
                // Injeta userCreateId na criação
                if (operation === 'create') {
                   if (!safeArgs.data) safeArgs.data = {};
                   safeArgs.data.userCreateId = userId;
                }
                
                // Injeta userCreateId em createMany
                if (operation === 'createMany' && safeArgs.data) {
                   if (Array.isArray(safeArgs.data)) {
                      safeArgs.data = safeArgs.data.map((item: any) => ({ ...item, userCreateId: userId }));
                   } else {
                      safeArgs.data = { ...safeArgs.data, userCreateId: userId };
                   }
                }

                // Injeta userUpdateId na atualização
                if (['update', 'updateMany'].includes(operation)) {
                   if (!safeArgs.data) safeArgs.data = {};
                   safeArgs.data.userUpdateId = userId;
                }

                // Injeta ambos no Upsert
                if (operation === 'upsert') {
                   safeArgs.create = { ...safeArgs.create, userCreateId: userId };
                   safeArgs.update = { ...safeArgs.update, userUpdateId: userId };
                }
              }

              // ============================================================
              // 2. MULTITENANCY (Company ID)
              // ============================================================
              // Regra: Se tem tenantId, não é Master, e o modelo não é público...
              
              // Exceção: User.create (quem lida é o Service, pois Master pode criar user pra outros)
              const isUserCreation = model === 'User' && operation === 'create';

              if (tenantId && !isMaster && !publicModels.includes(model) && !isUserCreation) {
                
                // A. Filtro Automático (Leitura/Update/Delete)
                if (
                  ['findMany', 'findFirst', 'count', 'update', 'updateMany', 'delete', 'deleteMany', 'aggregate', 'groupBy'].includes(operation)
                ) {
                  safeArgs.where = { ...safeArgs.where, companyId: tenantId };
                }

                // B. Tratamento findUnique -> findFirst (Para segurança IDOR)
                if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                    // Convertemos findUnique em findFirst para poder injetar o companyId no where
                    safeArgs.where = { ...safeArgs.where, companyId: tenantId };
                    
                    if (operation === 'findUnique') {
                        return (this as any)[model].findFirst(safeArgs);
                    } else {
                        return (this as any)[model].findFirstOrThrow(safeArgs);
                    }
                }

                // C. Injeção Automática no Create (Segurança na Escrita)
                if (operation === 'create') {
                   safeArgs.data.companyId = tenantId;
                }
                
                if (operation === 'createMany' && safeArgs.data) {
                    if (Array.isArray(safeArgs.data)) {
                        safeArgs.data = safeArgs.data.map((item: any) => ({ ...item, companyId: tenantId }));
                    } else {
                        safeArgs.data.companyId = tenantId;
                    }
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
    try {
      await this.$connect();
      console.log('✅ Conectado ao banco de dados (Enterprise Extensions Ativadas)');
    } catch (error) {
      console.error('❌ Erro ao conectar com o banco:', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}