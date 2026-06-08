/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AsaasService } from './asaas.service';
import { BillingAccessGuard } from './billing-access.guard';
import { BillingController } from './billing.controller';
import { BillingJobsService } from './billing-jobs.service';
import { BillingService } from './billing.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [BillingController],
  providers: [BillingService, AsaasService, BillingJobsService, BillingAccessGuard],
  exports: [BillingService, AsaasService, BillingAccessGuard],
})
export class BillingModule {}

