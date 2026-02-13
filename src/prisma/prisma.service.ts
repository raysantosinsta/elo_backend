import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

interface PrismaArgs {
  where?: Record<string, any>;
  data?: Record<string, any>;
  create?: Record<string, any>;
  update?: Record<string, any>;
}

interface PrismaModelDelegate {
  findFirst: (args: PrismaArgs) => Promise<unknown>;
  findFirstOrThrow: (args: PrismaArgs) => Promise<unknown>;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('PrismaService');
  private _extendedClient?: ReturnType<typeof this.extendClient>;
  private readonly availableModels = new Set<string>();

  constructor(private readonly cls: ClsService) {
    super({ log: ['error'] });
  }

  get extended() {
    if (!this._extendedClient) {
      this._extendedClient = this.extendClient();
    }
    return this._extendedClient;
  }

  private extendClient() {
    return this.$extends({
      query: {
        $allModels: {
          $allOperations: async ({ model, operation, args, query }) => {
            const tenantId = this.cls.get<string>('tenantId');
            const userId = this.cls.get<string>('userId');
            const isMaster = this.cls.get<boolean>('isMaster');

            const publicModels = ['Plan', 'Subscription'];
            const safeArgs = (args as PrismaArgs) || {};

            if (userId) {
              this.applyAudit(operation, safeArgs, userId);
            }

            if (isMaster) return query(safeArgs);

            if (tenantId && !publicModels.includes(model)) {
              return this.applyTenantFilter(
                model,
                operation,
                safeArgs,
                tenantId,
                query,
              );
            }

            return query(safeArgs);
          },
        },
      },
    });
  }

  private applyAudit(
    operation: string,
    args: PrismaArgs,
    userId: string,
  ): void {
    if (operation === 'create') {
      args.data = { ...args.data, userCreateId: userId, userUpdateId: userId };
    } else if (['update', 'updateMany', 'upsert'].includes(operation)) {
      if (operation === 'upsert') {
        args.create = {
          ...args.create,
          userCreateId: userId,
          userUpdateId: userId,
        };
        args.update = { ...args.update, userUpdateId: userId };
      } else {
        if (args.data) args.data = { ...args.data, userUpdateId: userId };
      }
    }
  }

  private async applyTenantFilter(
    model: string,
    operation: string,
    args: PrismaArgs,
    tenantId: string,
    query: (args: any) => Promise<unknown>,
  ): Promise<unknown> {
    const operationsWithWhere = [
      'findMany',
      'findFirst',
      'findUnique',
      'findUniqueOrThrow',
      'count',
      'update',
      'updateMany',
      'delete',
      'deleteMany',
      'aggregate',
      'groupBy',
    ];

    // --- PROTEÇÃO DE ESCRITA: Impede a troca de Tenant via Update ---
    if (['update', 'updateMany'].includes(operation) && args.data) {
      if (args.data.companyId) {
        // Remove qualquer tentativa de sobrescrever o ID da empresa
        delete args.data.companyId;
        this.logger.warn(
          `Tentativa bloqueada de alterar companyId no modelo ${model} pelo usuário.`,
        );
      }
    }

    if (operationsWithWhere.includes(operation)) {
      args.where = args.where || {};
      args.where[model === 'Company' ? 'id' : 'companyId'] = tenantId;

      if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
        const modelKey = model.charAt(0).toLowerCase() + model.slice(1);

        if (!this.availableModels.has(modelKey)) {
          throw new Error(`Model delegate ${modelKey} not found.`);
        }

        const delegate = this[
          modelKey as keyof this
        ] as unknown as PrismaModelDelegate;

        return operation === 'findUnique'
          ? delegate.findFirst(args)
          : delegate.findFirstOrThrow(args);
      }
    }

    if (operation === 'create' && model !== 'Company') {
      args.data = { ...args.data, companyId: tenantId };
    }

    return query(args);
  }

  async onModuleInit() {
    await this.$connect();

    const keys = Object.keys(this) as Array<keyof this>;

    for (const key of keys) {
      const keyStr = String(key);

      if (
        keyStr.startsWith('$') ||
        keyStr.startsWith('_') ||
        ['logger', 'cls', 'availableModels'].includes(keyStr)
      ) {
        continue;
      }

      const potentialDelegate = this[key];

      if (
        potentialDelegate &&
        typeof potentialDelegate === 'object' &&
        'findMany' in potentialDelegate
      ) {
        this.availableModels.add(keyStr);
      }
    }

    this.logger.log(
      `✅ Prisma Service initialized. ${this.availableModels.size} models mapped.`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
