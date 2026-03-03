/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  // ===========================================================================
  // 🔥 MÉTODO UTILITÁRIO PARA PEGAR COMPANY ID DO CLS
  // ===========================================================================
  private getCompanyIdFromContext(): string {
    const companyId = this.cls.get<string>('tenantId');
    if (!companyId) {
      this.logger.error('❌ companyId não encontrado no CLS');
      throw new ForbiddenException('Empresa não identificada');
    }
    return companyId;
  }

  // ===========================================================================
  // 🔥 MÉTODO PARA SANITIZAR DADOS (REMOVER CAMPOS SENSÍVEIS)
  // ===========================================================================
  private sanitizeData(data: any): any {
    if (data === null || data === undefined) return Prisma.JsonNull;

    // Se já for um objeto válido, faz uma cópia
    const sanitized = { ...data };

    // Lista de campos sensíveis que NÃO devem ser salvos
    const sensitiveFields = [
      'password',
      'senha',
      'token',
      'refreshToken',
      'accessToken',
      'resetToken',
      'verificationToken',
      'apiKey',
      'secret',
    ];

    // Remove campos sensíveis
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        delete sanitized[field];
      }
    }

    // Se after sanitize ficar vazio, retorna null
    if (Object.keys(sanitized).length === 0) {
      return Prisma.JsonNull;
    }

    return sanitized;
  }

  // ===========================================================================
  // 🔥 MÉTODO PARA TRATAR DATAS (converter para ISO string se necessário)
  // ===========================================================================
  private prepareDataForJson(data: any): any {
    if (data === null || data === undefined) return Prisma.JsonNull;

    if (typeof data !== 'object') return data;

    const prepared = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        prepared[key] = null;
      } else if (value instanceof Date) {
        // Converte Date para ISO string
        prepared[key] = value.toISOString();
      } else if (typeof value === 'object') {
        // Recursivamente prepara objetos aninhados
        prepared[key] = this.prepareDataForJson(value);
      } else {
        prepared[key] = value;
      }
    }

    return prepared;
  }

  async log(data: {
    action: string;
    entity: string;
    entityId: string;
    userId: string;
    companyId?: string | null;
    oldData?: any;
    newData?: any;
    metadata?: Record<string, any>;
  }) {
    try {
      // =======================================================================
      // DEBUG: Veja o que está chegando
      // =======================================================================
      console.log('🔍 AUDIT RAW DATA:', {
        action: data.action,
        hasNewData: !!data.newData,
        newDataKeys: data.newData ? Object.keys(data.newData) : [],
        hasMetadata: !!data.metadata,
        metadataKeys: data.metadata ? Object.keys(data.metadata) : [],
      });

      const companyId = data.companyId || this.getCompanyIdFromContext();

      // =======================================================================
      // PREPARA CADA CAMPO SEPARADAMENTE
      // =======================================================================

      // oldData: usa o que veio ou null
      const oldDataValue =
        data.oldData !== undefined && data.oldData !== null
          ? data.oldData
          : Prisma.JsonNull;

      // newData: usa o que veio ou null (NÃO MISTURAR COM METADATA!)
      const newDataValue =
        data.newData !== undefined && data.newData !== null
          ? data.newData
          : Prisma.JsonNull;

      // metadata: usa o que veio ou null
      const metadataValue =
        data.metadata !== undefined && data.metadata !== null
          ? data.metadata
          : Prisma.JsonNull;

      // =======================================================================
      // LOG PARA VER O QUE VAI SER SALVO
      // =======================================================================
      console.log('📦 AUDIT PREPARED:', {
        action: data.action,
        newData: newDataValue !== Prisma.JsonNull ? '✅ TEM DADOS' : '❌ VAZIO',
        newDataPreview:
          newDataValue !== Prisma.JsonNull
            ? JSON.stringify(newDataValue).substring(0, 200)
            : null,
        metadata:
          metadataValue !== Prisma.JsonNull ? '✅ TEM DADOS' : '❌ VAZIO',
      });

      // =======================================================================
      // SALVA NO BANCO
      // =======================================================================
      const result = await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          oldData: oldDataValue,
          newData: newDataValue, // ✅ ISSO VAI SALVAR TODOS OS DADOS DO ITEM
          metadata: metadataValue, // ✅ ISSO VAI SALVAR flowId E createdAt
          companyId: companyId,
        },
      });

      // =======================================================================
      // VERIFICA O QUE FOI SALVO
      // =======================================================================
      const saved = await this.prisma.auditLog.findUnique({
        where: { id: result.id },
        select: {
          newData: true,
          metadata: true,
        },
      });

      console.log('✅ AUDIT SALVO:', {
        id: result.id,
        newDataExists: !!saved?.newData,
        newDataKeys: saved?.newData ? Object.keys(saved.newData as object) : [],
        metadataExists: !!saved?.metadata,
        metadataKeys: saved?.metadata
          ? Object.keys(saved.metadata as object)
          : [],
      });

      return result;
    } catch (error) {
      console.error('❌ AUDIT ERRO:', error);
      return null; // Não quebra a aplicação
    }
  }

  // ===========================================================================
  // 🔒 MÉTODOS DE CONSULTA (já existentes)
  // ===========================================================================
  async getLogs(
    filters: {
      entity?: string;
      entityId?: string;
      action?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: {
      page: number;
      limit: number;
    },
  ) {
    const companyId = this.getCompanyIdFromContext();

    const where: any = { companyId };

    if (filters.entity) where.entity = filters.entity;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.action) where.action = filters.action;
    if (filters.userId) where.userId = filters.userId;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        pages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async getEntityHistory(entity: string, entityId: string) {
    const companyId = this.getCompanyIdFromContext();

    return this.prisma.auditLog.findMany({
      where: {
        companyId,
        entity,
        entityId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getItemLogs(itemId: string) {
    const companyId = this.getCompanyIdFromContext();

    return this.prisma.auditLog.findMany({
      where: {
        entity: 'FLOW_ITEM',
        entityId: itemId,
        companyId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
