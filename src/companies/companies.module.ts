/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager'; // <--- IMPORTANTE
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    // Registra o módulo de cache para este módulo
    CacheModule.register({
      ttl: 60000, // Configuração padrão (opcional), ex: 60 segundos
      max: 100, // Máximo de itens no cache
    }),
    PrismaModule, // Importe o Módulo do Prisma, não apenas o Service
  ],
  controllers: [CompaniesController],
  providers: [
    CompaniesService, // 1. Provider do Contador
    makeCounterProvider({
      name: 'company_created_total',
      help: 'Total number of companies created',
    }),
    // 2. Provider do Histograma
    makeHistogramProvider({
      name: 'db_operation_duration_seconds',
      help: 'Duration of DB operations in seconds',
      labelNames: ['operation'],
    }),],
  exports: [CompaniesService],
})
export class CompaniesModule { }