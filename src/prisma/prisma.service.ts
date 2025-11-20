// src/prisma/prisma.service.ts (para Prisma 6)
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: ['warn', 'error'],
      errorFormat: 'minimal',
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Prisma connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('✅ Prisma disconnected from database');
  }

  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        if (error.code === '42P05' && attempt < 3) {
          this.logger.warn(`🔄 Prepared statement error, retrying attempt ${attempt}`);
          await this.$disconnect();
          await this.$connect();
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }
        this.logger.error(`❌ Database operation failed after ${attempt} attempts:`, error);
        throw error;
      }
    }
    throw new Error('Max retry attempts exceeded');
  }
}