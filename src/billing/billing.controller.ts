/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { BillingService } from './billing.service';
import {
  AsaasWebhookDto,
  CreateBillingPlanDto,
  CreatePartnerDto,
  CreateReferralDto,
  CreateSubscriptionDto,
  ListCommissionsQueryDto,
  PayWithdrawalDto,
  RequestWithdrawalDto,
  ReviewPartnerDto,
  ReviewWithdrawalDto,
  StartTrialDto,
  UpdateBillingPlanDto,
  UpdateBillingStatusDto,
} from './dto/billing.dto';

@ApiTags('Billing / Asaas')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('plans')
  createPlan(@Body() dto: CreateBillingPlanDto) {
    return this.billing.createPlan(dto);
  }

  @Get('plans')
  listPlans(@Query('includeInactive') includeInactive?: string) {
    return this.billing.listPlans(includeInactive === 'true');
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdateBillingPlanDto) {
    return this.billing.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  deletePlan(@Param('id') id: string) {
    return this.billing.deletePlan(id);
  }

  @Post('trial/start')
  startTrial(@Body() dto: StartTrialDto) {
    return this.billing.startTrial(dto);
  }

  @Post('trial/expire')
  expireTrials() {
    return this.billing.expireTrials();
  }

  @Post('companies/:companyId/sync-asaas')
  syncCustomer(@Param('companyId') companyId: string) {
    return this.billing.syncCustomer(companyId);
  }

  @Post('subscriptions')
  createSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.billing.createSubscription(dto);
  }

  @Get('companies/:companyId')
  getCompanyBilling(@Param('companyId') companyId: string) {
    return this.billing.getCompanyBilling(companyId);
  }

  @Get('me')
  getMyBilling() {
    return this.billing.getCompanyBilling();
  }

  @Patch('companies/:companyId/status')
  updateCompanyStatus(@Param('companyId') companyId: string, @Body() dto: UpdateBillingStatusDto) {
    return this.billing.updateCompanyBillingStatus(companyId, dto);
  }

  @Public()
  @Post('asaas/webhook')
  @ApiOperation({ summary: 'Webhook publico do Asaas com idempotencia' })
  handleAsaasWebhook(@Body() dto: AsaasWebhookDto, @Headers('asaas-access-token') token?: string) {
    return this.billing.handleWebhook(dto, token);
  }

  @Post('partners')
  createPartner(@Body() dto: CreatePartnerDto) {
    return this.billing.createPartner(dto);
  }

  @Get('partners')
  listPartners() {
    return this.billing.listPartners();
  }

  @Patch('partners/:id/review')
  reviewPartner(@Param('id') id: string, @Body() dto: ReviewPartnerDto) {
    return this.billing.reviewPartner(id, dto);
  }

  @Public()
  @Post('partners/:code/referrals')
  createReferral(@Param('code') code: string, @Body() dto: CreateReferralDto) {
    return this.billing.createReferral(code, dto);
  }

  @Get('partners/dashboard')
  getMyPartnerDashboard() {
    return this.billing.getPartnerDashboard();
  }

  @Get('partners/:id/dashboard')
  getPartnerDashboard(@Param('id') id: string) {
    return this.billing.getPartnerDashboard(id);
  }

  @Get('commissions')
  listCommissions(@Query() query: ListCommissionsQueryDto) {
    return this.billing.listCommissions(query);
  }

  @Post('commissions/release')
  releaseCommissions() {
    return this.billing.releasePendingCommissions();
  }

  @Post('withdrawals')
  requestMyWithdrawal(@Body() dto: RequestWithdrawalDto) {
    return this.billing.requestWithdrawal(dto);
  }

  @Post('partners/:partnerId/withdrawals')
  requestWithdrawal(@Param('partnerId') partnerId: string, @Body() dto: RequestWithdrawalDto) {
    return this.billing.requestWithdrawal(dto, partnerId);
  }

  @Patch('withdrawals/:id/review')
  reviewWithdrawal(@Param('id') id: string, @Body() dto: ReviewWithdrawalDto) {
    return this.billing.reviewWithdrawal(id, dto);
  }

  @Patch('withdrawals/:id/pay')
  payWithdrawal(@Param('id') id: string, @Body() dto: PayWithdrawalDto) {
    return this.billing.payWithdrawal(id, dto);
  }

  @Get('admin/kpis')
  getAdminKpis() {
    return this.billing.getAdminKpis();
  }
}

