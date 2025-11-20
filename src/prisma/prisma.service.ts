// src/prisma/prisma.service.ts - VERSÃO SIMPLIFICADA
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static instance: PrismaService;

  constructor() {
    super({
      log: ['warn', 'error'],
      errorFormat: 'minimal',
      // 🔥 SEM datasources - o Prisma vai pegar do schema.prisma
    });

    // 🔥 IMPEDE MÚLTIPLAS INSTÂNCIAS
    if (PrismaService.instance) {
      return PrismaService.instance;
    }
    PrismaService.instance = this;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Conectado ao banco de dados (Singleton)');
    } catch (error) {
      console.error('❌ Erro ao conectar com o banco:', error);
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      console.log('❌ Desconectado do banco de dados');
    } catch (error) {
      console.error('❌ Erro ao desconectar:', error);
    }
  }
}