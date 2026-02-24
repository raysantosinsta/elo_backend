/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    private readonly cls: ClsService, // 🔥 ADICIONADO CLS
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
  // 📝 MÉTODO DE LOG (AGORA USA CLS PARA companyId)
  // ===========================================================================
  async log(data: {
    action: string;
    entity: string;
    entityId: string;
    userId: string;
    companyId?: string | null; // 🔥 AGORA É OPCIONAL - se não vier, pega do CLS
    oldData?: any;
    newData?: any;
    metadata?: Record<string, any>;
  }) {
    try {
      if (!data.userId) {
        this.logger.warn('❌ AUDIT: Tentativa sem userId:', data);
        return;
      }

      // 🔥 PRIORIDADE:
      // 1. Se companyId foi passado, usa ele (para casos especiais como MASTER)
      // 2. Senão, pega do CLS
      const companyId = data.companyId || this.getCompanyIdFromContext();

      this.logger.debug('📝 AUDIT - Recebido:', {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
        companyId: companyId,
        hasOldData: !!data.oldData,
        hasNewData: !!data.newData,
        hasMetadata: !!data.metadata,
      });

      const sanitizedOldData = this.sanitizeData(data.oldData);
      const sanitizedNewData = this.sanitizeData(data.newData);

      const result = await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          oldData: sanitizedOldData || {}, // Se for null, salva objeto vazio
          newData: sanitizedNewData || {},
          metadata: data.metadata || {},
          companyId: companyId, // 🔥 USA O COMPANY ID RESOLVIDO
        },
      });

      this.logger.debug('✅ AUDIT - Registrado com sucesso. ID:', result.id);
    } catch (error) {
      this.logger.error('❌ AUDIT - Erro ao registrar:', error);
    }
  }

  // ===========================================================================
  // 🔒 MÉTODOS DE CONSULTA (AGORA USAM CLS)
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
    const companyId = this.getCompanyIdFromContext(); // 🔥 PEGA DO CLS

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
    const companyId = this.getCompanyIdFromContext(); // 🔥 PEGA DO CLS

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

  // ===========================================================================
  // 🧹 MÉTODO PARA SANITIZAR DADOS SENSÍVEIS
  // ===========================================================================
  private sanitizeData(data: any): any {
    if (!data) return null;

    const sensitiveFields = [
      'password',
      'senha',
      'token',
      'resetToken',
      'accessToken',
    ];
    const sanitized = { ...data };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
