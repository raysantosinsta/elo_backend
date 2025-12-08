import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager'; // <--- IMPORTANTE
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { PrismaModule } from 'src/prisma/prisma.module'; 

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
  providers: [CompaniesService], 
  // Nota: Não precisa colocar PrismaService em providers se ele já é exportado pelo PrismaModule
})
export class CompaniesModule {}