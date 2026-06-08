/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { BillingService } from './billing.service';

@Injectable()
export class BillingJobsService {
  private readonly logger = new Logger(BillingJobsService.name);

  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 2 * * *')
  async expireTrials() {
    const result = await this.billing.expireTrials(false);
    if (result.expired) {
      this.logger.log(`Trials expirados automaticamente: ${result.expired}`);
    }
  }

  @Cron('0 3 * * *')
  async releaseCommissions() {
    const result = await this.billing.releasePendingCommissions(false);
    if (result.released) {
      this.logger.log(`Comissoes liberadas automaticamente: ${result.released}`);
    }
  }

  @Cron('*/30 * * * *')
  async syncPendingCheckoutPayments() {
    if (!this.config.get<string>('ASAAS_API_KEY')) {
      return;
    }

    const result = await this.billing.syncAllPendingCheckoutPayments(50, false);
    if (result.checkedCompanies) {
      this.logger.log(`Checkouts pendentes sincronizados: ${result.checkedCompanies} empresas`);
    }
  }
}
