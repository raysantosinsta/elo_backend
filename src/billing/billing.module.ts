/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AsaasService } from './asaas.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [BillingController],
  providers: [BillingService, AsaasService],
  exports: [BillingService, AsaasService],
})
export class BillingModule {}

