/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingAccountStatus,
  BillingPaymentStatus,
  BillingSubscriptionStatus,
  BillingWebhookStatus,
  PartnerCommissionStatus,
  PartnerStatus,
  PartnerWithdrawalStatus,
  PlanPeriod,
  Prisma,
  UserRole,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasService } from './asaas.service';
import {
  AsaasWebhookDto,
  CreateBillingPlanDto,
  CreateCheckoutDto,
  CreatePartnerDto,
  CreateReferralDto,
  CreateSubscriptionDto,
  PayWithdrawalDto,
  RequestWithdrawalDto,
  ReviewPartnerDto,
  ReviewWithdrawalDto,
  StartTrialDto,
  UpdateBillingPlanDto,
  UpdateBillingStatusDto,
} from './dto/billing.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
    private readonly cls: ClsService,
    private readonly config: ConfigService,
  ) {}

  async createPlan(dto: CreateBillingPlanDto) {
    this.assertMaster();
    return this.prisma.billingPlan.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: new Prisma.Decimal(dto.price),
        period: dto.period || PlanPeriod.MONTHLY,
        trialDays: dto.trialDays ?? 7,
        userLimit: dto.userLimit,
        features: dto.features || Prisma.JsonNull,
      },
    });
  }

  async listPlans(includeInactive = false) {
    const canIncludeInactive = includeInactive && this.isMaster();
    return this.prisma.billingPlan.findMany({
      where: canIncludeInactive ? {} : { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  async updatePlan(id: string, dto: UpdateBillingPlanDto) {
    this.assertMaster();
    return this.prisma.billingPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
        ...(dto.period !== undefined ? { period: dto.period } : {}),
        ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
        ...(dto.userLimit !== undefined ? { userLimit: dto.userLimit } : {}),
        ...(dto.features !== undefined ? { features: dto.features } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deletePlan(id: string) {
    this.assertMaster();
    return this.prisma.billingPlan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async startTrial(dto: StartTrialDto) {
    await this.assertCompanyAccess(dto.companyId);
    const trialDays = dto.trialDays ?? 7;
    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    const partner = dto.partnerCode
      ? await this.prisma.partner.findUnique({ where: { code: dto.partnerCode } })
      : null;

    return this.prisma.company.update({
      where: { id: dto.companyId },
      data: {
        billingStatus: BillingAccountStatus.TRIAL_ACTIVE,
        trialStart,
        trialEnd,
        referredByPartnerId: partner?.status === PartnerStatus.APPROVED ? partner.id : undefined,
      },
      select: this.companyBillingSelect(),
    });
  }

  async expireTrials(requireMaster = true) {
    if (requireMaster) this.assertMaster();
    const now = new Date();
    const result = await this.prisma.company.updateMany({
      where: {
        billingStatus: BillingAccountStatus.TRIAL_ACTIVE,
        trialEnd: { lt: now },
      },
      data: { billingStatus: BillingAccountStatus.TRIAL_EXPIRED },
    });
    return { expired: result.count };
  }

  async syncCustomer(companyId: string) {
    await this.assertCompanyAccess(companyId);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa nao encontrada');
    if (company.asaasCustomerId) return company;

    try {
      const customer = await this.asaas.createCustomer({
        name: company.name,
        email: company.email,
        cpfCnpj: company.cnpj.replace(/\D/g, ''),
        phone: company.telefone,
        externalReference: company.id,
      });

      return this.prisma.company.update({
        where: { id: companyId },
        data: { asaasCustomerId: customer.id },
        select: this.companyBillingSelect(),
      });
    } catch (error) {
      throw new BadRequestException(this.asaas.sanitizeError(error));
    }
  }

  async createSubscription(dto: CreateSubscriptionDto) {
    await this.assertCompanyAccess(dto.companyId);
    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new NotFoundException('Empresa nao encontrada');
    const plan = await this.prisma.billingPlan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plano ativo nao encontrado');

    const synced = company.asaasCustomerId ? company : await this.syncCustomer(dto.companyId);
    const nextDueDate = dto.nextDueDate || this.formatDate(new Date());

    try {
      const asaasSubscription = await this.asaas.createSubscription({
        customer: synced.asaasCustomerId!,
        billingType: dto.billingType || 'UNDEFINED',
        value: Number(plan.price),
        nextDueDate,
        cycle: plan.period === PlanPeriod.YEARLY ? 'YEARLY' : 'MONTHLY',
        description: `Assinatura ${plan.name}`,
        externalReference: dto.companyId,
      });

      const subscription = await this.prisma.billingSubscription.create({
        data: {
          companyId: dto.companyId,
          planId: plan.id,
          value: plan.price,
          cycle: plan.period,
          status: BillingSubscriptionStatus.ACTIVE,
          asaasSubscriptionId: asaasSubscription.id,
          nextDueDate: asaasSubscription.nextDueDate ? new Date(`${asaasSubscription.nextDueDate}T00:00:00`) : new Date(`${nextDueDate}T00:00:00`),
        },
      });

      await this.prisma.company.update({
        where: { id: dto.companyId },
        data: { billingStatus: BillingAccountStatus.ACTIVE },
      });

      return subscription;
    } catch (error) {
      throw new BadRequestException(this.asaas.sanitizeError(error));
    }
  }

  async createCheckout(dto: CreateCheckoutDto) {
    await this.assertCompanyAccess(dto.companyId);
    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new NotFoundException('Empresa nao encontrada');
    const plan = await this.prisma.billingPlan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plano ativo nao encontrado');
    const trialPeriod = this.buildTrialPeriod(plan.trialDays);

    console.log('=== ASAAS CHECKOUT SOLICITADO ===');
    console.log('[ASAAS CHECKOUT] Empresa:', {
      companyId: company.id,
      name: company.name,
      email: company.email,
      cnpj: company.cnpj,
      asaasCustomerIdAtual: company.asaasCustomerId || null,
      billingStatus: company.billingStatus,
    });
    console.log('[ASAAS CHECKOUT] Plano:', {
      planId: plan.id,
      name: plan.name,
      price: String(plan.price),
      period: plan.period,
      trialDays: plan.trialDays,
    });

    const pending = await this.prisma.billingSubscription.create({
      data: {
        companyId: dto.companyId,
        planId: plan.id,
        value: plan.price,
        cycle: plan.period,
        status: BillingSubscriptionStatus.PENDING,
      },
    });
    console.log('[ASAAS CHECKOUT] Assinatura local pendente criada:', {
      subscriptionId: pending.id,
      companyId: pending.companyId,
      planId: pending.planId,
      status: pending.status,
      externalReferenceEnviadoAoAsaas: pending.id,
    });

    await this.prisma.company.update({
      where: { id: dto.companyId },
      data: {
        billingStatus: BillingAccountStatus.TRIAL_ACTIVE,
        trialStart: company.trialStart || trialPeriod.trialStart,
        trialEnd: company.trialEnd || trialPeriod.trialEnd,
      },
    });

    try {
      const checkoutSuccessUrl = this.config.get<string>('ASAAS_CHECKOUT_SUCCESS_URL');
      const configuredWebhookUrl = this.config.get<string>('ASAAS_WEBHOOK_URL');
      const backendUrl = this.config.get<string>('BACKEND_URL');
      const expectedWebhookUrl = configuredWebhookUrl || (backendUrl
        ? `${backendUrl}/billing/asaas/webhook`
        : 'CONFIGURE_NO_ASAAS: https://SEU_BACKEND/billing/asaas/webhook');
      console.log('[ASAAS CHECKOUT] URLs configuradas:', {
        checkoutSuccessUrl: checkoutSuccessUrl || null,
        expectedWebhookUrl,
        observacao: 'successUrl e apenas retorno do navegador; webhook precisa estar configurado no painel/API do Asaas.',
      });
      const paymentLinkPayload = {
        name: `Assinatura ${plan.name}`,
        description: plan.description || `Assinatura ${plan.name} - Elospro`,
        value: Number(plan.price),
        billingType: dto.billingType || 'UNDEFINED',
        chargeType: 'RECURRENT',
        subscriptionCycle: plan.period === PlanPeriod.YEARLY ? 'YEARLY' : 'MONTHLY',
        dueDateLimitDays: 3,
        externalReference: pending.id,
        notificationEnabled: true,
        ...(checkoutSuccessUrl
          ? {
              callback: {
                successUrl: checkoutSuccessUrl,
                autoRedirect: true,
              },
            }
          : {}),
      };
      const paymentLink = await this.createPaymentLinkWithCallbackFallback(paymentLinkPayload, checkoutSuccessUrl);
      console.log('[ASAAS CHECKOUT] Payment link retornado pelo Asaas:', {
        id: paymentLink.id,
        url: paymentLink.url || paymentLink.link || paymentLink.paymentLinkUrl,
        chargeType: paymentLink.chargeType,
        billingType: paymentLink.billingType,
        subscriptionCycle: paymentLink.subscriptionCycle,
        externalReference: paymentLink.externalReference,
        rawKeys: Object.keys(paymentLink || {}),
      });

      const checkoutUrl = paymentLink.url || paymentLink.link || paymentLink.paymentLinkUrl;
      if (!checkoutUrl) {
        throw new BadRequestException('Asaas nao retornou URL de checkout');
      }

      const subscription = await this.prisma.billingSubscription.update({
        where: { id: pending.id },
        data: {
          asaasPaymentLinkId: paymentLink.id,
          checkoutUrl,
        },
        include: { plan: true },
      });
      console.log('[ASAAS CHECKOUT] Assinatura local vinculada ao payment link:', {
        subscriptionId: subscription.id,
        companyId: subscription.companyId,
        asaasPaymentLinkId: subscription.asaasPaymentLinkId,
        checkoutUrl: subscription.checkoutUrl,
        status: subscription.status,
      });

      return {
        subscriptionId: subscription.id,
        paymentLinkId: paymentLink.id,
        checkoutUrl,
      };
    } catch (error) {
      await this.prisma.billingSubscription.update({
        where: { id: pending.id },
        data: { status: BillingSubscriptionStatus.CANCELED, canceledAt: new Date() },
      });
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(this.asaas.sanitizeError(error));
    }
  }

  private async createPaymentLinkWithCallbackFallback(paymentLinkPayload: any, checkoutSuccessUrl?: string) {
    try {
      return await this.asaas.createPaymentLink(paymentLinkPayload);
    } catch (error) {
      if (!checkoutSuccessUrl || !this.isAsaasDomainConfigError(error)) {
        throw error;
      }
      console.log('[ASAAS CHECKOUT] Dominio do callback nao cadastrado no Asaas. Tentando criar checkout sem callback:', {
        checkoutSuccessUrl,
        detalhe: this.asaas.sanitizeError(error),
      });
      const { callback, ...payloadWithoutCallback } = paymentLinkPayload;
      return this.asaas.createPaymentLink(payloadWithoutCallback);
    }
  }

  async getCompanyBilling(companyId?: string) {
    const resolvedCompanyId = companyId || this.cls.get<string>('tenantId');
    if (!resolvedCompanyId) throw new BadRequestException('Empresa nao informada');
    await this.assertCompanyAccess(resolvedCompanyId);
    await this.syncPendingCheckoutPaymentsSafely(resolvedCompanyId);
    const company = await this.prisma.company.findUnique({
      where: { id: resolvedCompanyId },
      select: {
        ...this.companyBillingSelect(),
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 5, include: { plan: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!company) throw new NotFoundException('Empresa nao encontrada');
    return company;
  }

  async syncPendingCheckoutPayments(companyId?: string) {
    const resolvedCompanyId = companyId || this.cls.get<string>('tenantId');
    if (!resolvedCompanyId) throw new BadRequestException('Empresa nao informada');
    await this.assertCompanyAccess(resolvedCompanyId);
    return this.syncPendingCheckoutPaymentsForCompany(resolvedCompanyId);
  }

  async syncAllPendingCheckoutPayments(limit = 50, requireMaster = true) {
    if (requireMaster) this.assertMaster();
    const pendingCompanies = await this.prisma.billingSubscription.findMany({
      where: {
        asaasPaymentLinkId: { not: null },
        status: { in: [BillingSubscriptionStatus.PENDING, BillingSubscriptionStatus.ACTIVE] },
      },
      distinct: ['companyId'],
      select: { companyId: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const processed: any[] = [];
    for (const item of pendingCompanies) {
      try {
        processed.push(await this.syncPendingCheckoutPaymentsForCompany(item.companyId));
      } catch (error) {
        processed.push({
          companyId: item.companyId,
          error: this.asaas.sanitizeError(error),
        });
      }
    }

    return {
      checkedCompanies: pendingCompanies.length,
      processed,
    };
  }

  private async syncPendingCheckoutPaymentsSafely(companyId: string) {
    try {
      await this.syncPendingCheckoutPaymentsForCompany(companyId);
    } catch (error) {
      console.log('[ASAAS SYNC] Falha ao sincronizar checkouts pendentes:', {
        companyId,
        error: this.asaas.sanitizeError(error),
      });
    }
  }

  private async syncPendingCheckoutPaymentsForCompany(companyId: string) {
    console.log('=== ASAAS SYNC CHECKOUTS PENDENTES ===');
    console.log('[ASAAS SYNC] Empresa:', companyId);

    const pendingSubscriptions = await this.prisma.billingSubscription.findMany({
      where: {
        companyId,
        asaasPaymentLinkId: { not: null },
        status: { in: [BillingSubscriptionStatus.PENDING, BillingSubscriptionStatus.ACTIVE] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { company: true },
    });

    console.log('[ASAAS SYNC] Assinaturas locais encontradas:', pendingSubscriptions.map((subscription) => ({
      subscriptionId: subscription.id,
      status: subscription.status,
      asaasPaymentLinkId: subscription.asaasPaymentLinkId,
      asaasSubscriptionId: subscription.asaasSubscriptionId,
      companyAsaasCustomerId: subscription.company.asaasCustomerId || null,
    })));

    const processed: any[] = [];
    for (const subscription of pendingSubscriptions) {
      const payments = await this.findAsaasPaymentsForSubscription(subscription.id);
      console.log('[ASAAS SYNC] Pagamentos encontrados no Asaas:', {
        subscriptionId: subscription.id,
        count: payments.length,
        payments: payments.map((payment) => ({
          id: payment.id,
          status: payment.status,
          customer: this.extractAsaasCustomerId(payment) || null,
          subscription: payment.subscription || null,
          paymentLink: payment.paymentLink || null,
          externalReference: payment.externalReference || null,
        })),
      });

      const paidPayment = payments.find((payment) => this.isAsaasPaymentApproved(payment));
      if (!paidPayment) {
        processed.push({ subscriptionId: subscription.id, synced: false, reason: 'Nenhum pagamento RECEIVED/CONFIRMED encontrado' });
        continue;
      }

      const event = paidPayment.status === 'CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_RECEIVED';
      await this.upsertPaymentFromAsaas(event, paidPayment, subscription.companyId);
      const company = await this.prisma.company.findUnique({
        where: { id: subscription.companyId },
        select: {
          id: true,
          name: true,
          email: true,
          cnpj: true,
          asaasCustomerId: true,
          billingStatus: true,
        },
      });
      console.log('[ASAAS SYNC] Empresa apos sincronizacao:', company);
      processed.push({
        subscriptionId: subscription.id,
        synced: true,
        paymentId: paidPayment.id,
        customer: this.extractAsaasCustomerId(paidPayment) || null,
        company,
      });
    }

    return { companyId, checked: pendingSubscriptions.length, processed };
  }

  private async findAsaasPaymentsForSubscription(subscriptionId: string) {
    const byExternalReference = await this.asaas.listPayments({ externalReference: subscriptionId, limit: 20 });
    const payments = this.extractAsaasListData(byExternalReference);
    if (payments.length) return payments;

    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { id: subscriptionId },
      select: { asaasSubscriptionId: true },
    });
    if (!subscription?.asaasSubscriptionId) return payments;

    const bySubscription = await this.asaas.listPayments({ subscription: subscription.asaasSubscriptionId, limit: 20 });
    return this.extractAsaasListData(bySubscription);
  }

  private extractAsaasListData(response: any) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    return [];
  }

  private isAsaasPaymentApproved(payment: any) {
    return payment?.status === 'RECEIVED' || payment?.status === 'CONFIRMED';
  }

  async updateCompanyBillingStatus(companyId: string, dto: UpdateBillingStatusDto) {
    this.assertMaster();
    return this.prisma.company.update({
      where: { id: companyId },
      data: { billingStatus: dto.status },
      select: this.companyBillingSelect(),
    });
  }

  async handleWebhook(dto: AsaasWebhookDto, token?: string) {
    const expectedToken = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (expectedToken && token !== expectedToken) {
      throw new ForbiddenException('Token de webhook invalido');
    }

    this.logAsaasWebhookPayload(dto);

    const eventId = dto.id || `${dto.event}:${dto.payment?.id || dto.subscription?.id || Date.now()}`;
    const existing = await this.prisma.asaasWebhookEvent.findUnique({ where: { eventId } });
    if (existing) {
      console.log('[ASAAS WEBHOOK] Evento duplicado:', eventId);
      await this.prisma.asaasWebhookEvent.update({
        where: { eventId },
        data: { status: BillingWebhookStatus.DUPLICATED },
      });
      return { duplicated: true, eventId };
    }

    const companyId = await this.resolveCompanyIdFromWebhook(dto);
    console.log('[ASAAS WEBHOOK] Company ID resolvido:', companyId || null);
    await this.prisma.asaasWebhookEvent.create({
      data: {
        eventId,
        eventType: dto.event,
        companyId,
        rawPayload: dto as any,
      },
    });

    try {
      await this.processWebhook(dto, companyId);
      await this.prisma.asaasWebhookEvent.update({
        where: { eventId },
        data: { status: BillingWebhookStatus.PROCESSED, processedAt: new Date() },
      });
      return { processed: true, eventId };
    } catch (error: any) {
      await this.prisma.asaasWebhookEvent.update({
        where: { eventId },
        data: { status: BillingWebhookStatus.FAILED, errorMessage: error?.message || String(error) },
      });
      throw error;
    }
  }

  private async processWebhook(dto: AsaasWebhookDto, companyId?: string | null) {
    console.log('[ASAAS WEBHOOK] Processando evento:', dto.event);
    if (dto.payment) {
      await this.upsertPaymentFromAsaas(dto.event, dto.payment, companyId);
    }
    if (dto.subscription) {
      await this.updateSubscriptionFromAsaas(dto.event, dto.subscription);
    }
  }

  private async upsertPaymentFromAsaas(event: string, payment: any, companyId?: string | null) {
    const resolvedCompanyId = companyId || await this.resolveCompanyIdFromPayment(payment);
    const asaasCustomerId = this.extractAsaasCustomerId(payment);
    console.log('[ASAAS WEBHOOK] Payment customer extraido:', asaasCustomerId || null);
    console.log('[ASAAS WEBHOOK] Payment company resolvida:', resolvedCompanyId || null);
    if (!resolvedCompanyId) {
      console.log('[ASAAS WEBHOOK] Pagamento sem empresa resolvida. Customer recebido:', asaasCustomerId || null);
      return;
    }
    const status = this.mapPaymentStatus(event, payment.status);
    const subscription = await this.resolveSubscriptionFromPayment(payment);
    console.log('[ASAAS WEBHOOK] Payment status mapeado:', status);
    console.log('[ASAAS WEBHOOK] Payment subscription local:', subscription?.id || null);

    const saved = await this.prisma.billingPayment.upsert({
      where: { asaasPaymentId: payment.id },
      update: {
        status,
        value: new Prisma.Decimal(payment.value || 0),
        netValue: payment.netValue !== undefined ? new Prisma.Decimal(payment.netValue) : undefined,
        dueDate: payment.dueDate ? new Date(`${payment.dueDate}T00:00:00`) : undefined,
        paymentDate: payment.paymentDate || payment.clientPaymentDate ? new Date(`${payment.paymentDate || payment.clientPaymentDate}T00:00:00`) : undefined,
        invoiceUrl: payment.invoiceUrl,
        bankSlipUrl: payment.bankSlipUrl,
        rawPayload: payment,
      },
      create: {
        companyId: resolvedCompanyId,
        subscriptionId: subscription?.id,
        asaasPaymentId: payment.id,
        status,
        billingType: payment.billingType,
        value: new Prisma.Decimal(payment.value || 0),
        netValue: payment.netValue !== undefined ? new Prisma.Decimal(payment.netValue) : undefined,
        dueDate: payment.dueDate ? new Date(`${payment.dueDate}T00:00:00`) : undefined,
        paymentDate: payment.paymentDate || payment.clientPaymentDate ? new Date(`${payment.paymentDate || payment.clientPaymentDate}T00:00:00`) : undefined,
        invoiceUrl: payment.invoiceUrl,
        bankSlipUrl: payment.bankSlipUrl,
        rawPayload: payment,
      },
    });

    if (status === BillingPaymentStatus.RECEIVED || status === BillingPaymentStatus.CONFIRMED) {
      const trialPeriod = subscription?.planId ? await this.buildTrialPeriodFromSubscription(subscription.id) : null;
      const updatedCompany = await this.prisma.company.update({
        where: { id: resolvedCompanyId },
        data: {
          billingStatus: BillingAccountStatus.ACTIVE,
          ...(asaasCustomerId ? { asaasCustomerId } : {}),
          ...(trialPeriod
            ? {
                trialStart: trialPeriod.trialStart,
                trialEnd: trialPeriod.trialEnd,
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          cnpj: true,
          asaasCustomerId: true,
          billingStatus: true,
        },
      });
      console.log('[ASAAS WEBHOOK] Empresa ativada apos pagamento:', updatedCompany);
      if (subscription) {
        const updatedSubscription = await this.prisma.billingSubscription.update({
          where: { id: subscription.id },
          data: {
            status: BillingSubscriptionStatus.ACTIVE,
            asaasSubscriptionId: payment.subscription || subscription.asaasSubscriptionId,
            nextDueDate: payment.dueDate ? new Date(`${payment.dueDate}T00:00:00`) : subscription.nextDueDate,
          },
          select: {
            id: true,
            asaasSubscriptionId: true,
            status: true,
          },
        });
        console.log('[ASAAS WEBHOOK] Assinatura atualizada via pagamento:', updatedSubscription);
      }
      await this.generateCommissionForPayment(saved.id);
    }

    if (status === BillingPaymentStatus.OVERDUE) {
      await this.prisma.company.update({ where: { id: resolvedCompanyId }, data: { billingStatus: BillingAccountStatus.OVERDUE } });
    }

    if (
      status === BillingPaymentStatus.REFUNDED ||
      status === BillingPaymentStatus.CHARGEBACK ||
      status === BillingPaymentStatus.CANCELED
    ) {
      await this.reverseCommissionsForPayment(saved.id, status);
    }
  }

  private async updateSubscriptionFromAsaas(event: string, subscription: any) {
    const local = await this.resolveSubscriptionFromAsaasSubscription(subscription);
    const asaasCustomerId = this.extractAsaasCustomerId(subscription);
    console.log('[ASAAS WEBHOOK] Subscription customer extraido:', asaasCustomerId || null);
    console.log('[ASAAS WEBHOOK] Subscription local resolvida:', local?.id || null);
    if (!local) {
      console.log('[ASAAS WEBHOOK] Assinatura sem registro local resolvido:', {
        id: subscription?.id,
        externalReference: subscription?.externalReference,
        paymentLink: subscription?.paymentLink,
        customer: asaasCustomerId || null,
      });
      return;
    }
    const status = event.includes('DELETED') || event.includes('CANCELED')
      ? BillingSubscriptionStatus.CANCELED
      : BillingSubscriptionStatus.ACTIVE;
    await this.prisma.billingSubscription.update({
      where: { id: local.id },
      data: {
        status,
        asaasSubscriptionId: subscription.id || local.asaasSubscriptionId,
        nextDueDate: subscription.nextDueDate ? new Date(`${subscription.nextDueDate}T00:00:00`) : undefined,
        canceledAt: status === BillingSubscriptionStatus.CANCELED ? new Date() : undefined,
      },
    });
    if (status === BillingSubscriptionStatus.CANCELED) {
      await this.prisma.company.update({ where: { id: local.companyId }, data: { billingStatus: BillingAccountStatus.CANCELED } });
    } else if (asaasCustomerId) {
      const updatedCompany = await this.prisma.company.update({
        where: { id: local.companyId },
        data: {
          billingStatus: BillingAccountStatus.ACTIVE,
          asaasCustomerId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          cnpj: true,
          asaasCustomerId: true,
          billingStatus: true,
        },
      });
      console.log('[ASAAS WEBHOOK] Empresa atualizada via assinatura:', updatedCompany);
    }
  }

  async createPartner(dto: CreatePartnerDto) {
    this.assertAdmin();
    const code = await this.generatePartnerCode(dto.companyId);
    return this.prisma.partner.create({
      data: {
        companyId: dto.companyId,
        userId: dto.userId,
        code,
        commissionRate: new Prisma.Decimal(dto.commissionRate ?? 10),
      },
      include: { company: true, user: true },
    });
  }

  async listPartners() {
    this.assertAdmin();
    return this.prisma.partner.findMany({
      include: { company: true, user: true, _count: { select: { referredCompanies: true, commissions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewPartner(id: string, dto: ReviewPartnerDto) {
    this.assertAdmin();
    return this.prisma.partner.update({
      where: { id },
      data: {
        status: dto.status,
        rejectedReason: dto.rejectedReason,
        approvedAt: dto.status === PartnerStatus.APPROVED ? new Date() : undefined,
        approvedById: this.cls.get<string>('userId'),
      },
    });
  }

  async createReferral(partnerCode: string, dto: CreateReferralDto) {
    const partner = await this.prisma.partner.findUnique({ where: { code: partnerCode } });
    if (!partner || partner.status !== PartnerStatus.APPROVED) {
      throw new NotFoundException('Parceiro aprovado nao encontrado');
    }
    return this.prisma.partnerReferral.create({
      data: {
        partnerId: partner.id,
        leadName: dto.leadName,
        document: dto.document,
        email: dto.email,
        phone: dto.phone,
      },
    });
  }

  async getPartnerDashboard(partnerId?: string) {
    const partner = await this.resolvePartner(partnerId);
    const [summary, commissions, withdrawals, referrals] = await Promise.all([
      this.getPartnerSummary(partner.id),
      this.prisma.partnerCommission.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: 'desc' }, take: 20, include: { company: true, payment: true } }),
      this.prisma.partnerWithdrawal.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.partnerReferral.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return { partner, summary, commissions, withdrawals, referrals };
  }

  async listCommissions(params: { partnerId?: string; status?: string }) {
    if (!params.partnerId) this.assertAdmin();
    const where: any = {};
    if (params.partnerId) where.partnerId = params.partnerId;
    if (params.status) where.status = params.status;
    return this.prisma.partnerCommission.findMany({
      where,
      include: { partner: { include: { company: true } }, company: true, payment: true, withdrawal: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async releasePendingCommissions(requireAdmin = true) {
    if (requireAdmin) this.assertAdmin();
    const now = new Date();
    const result = await this.prisma.partnerCommission.updateMany({
      where: { status: PartnerCommissionStatus.PENDING, availableAt: { lte: now } },
      data: { status: PartnerCommissionStatus.AVAILABLE },
    });
    return { released: result.count };
  }

  async requestWithdrawal(dto: RequestWithdrawalDto, partnerId?: string) {
    const partner = await this.resolvePartner(partnerId);
    const amount = new Prisma.Decimal(dto.amount);
    const available = await this.sumAvailableCommissions(partner.id, dto.commissionIds);
    if (available.lessThan(amount)) {
      throw new BadRequestException('Saldo disponivel insuficiente para saque');
    }

    const withdrawal = await this.prisma.partnerWithdrawal.create({
      data: {
        partnerId: partner.id,
        companyId: partner.companyId,
        amount,
        nfseUrl: dto.nfseUrl,
        nfseNumber: dto.nfseNumber,
        nfseDocument: dto.nfseDocument,
        nfseIssuedAt: dto.nfseIssuedAt ? new Date(dto.nfseIssuedAt) : undefined,
        status: PartnerWithdrawalStatus.REQUESTED,
      },
    });

    await this.prisma.partnerCommission.updateMany({
      where: {
        partnerId: partner.id,
        status: PartnerCommissionStatus.AVAILABLE,
        ...(dto.commissionIds?.length ? { id: { in: dto.commissionIds } } : {}),
      },
      data: { status: PartnerCommissionStatus.BLOCKED, withdrawalId: withdrawal.id },
    });

    return withdrawal;
  }

  async reviewWithdrawal(id: string, dto: ReviewWithdrawalDto) {
    this.assertAdmin();
    const withdrawal = await this.prisma.partnerWithdrawal.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.rejectionReason,
        reviewedAt: new Date(),
        reviewedById: this.cls.get<string>('userId'),
      },
    });

    if (dto.status === PartnerWithdrawalStatus.REJECTED) {
      await this.prisma.partnerCommission.updateMany({
        where: { withdrawalId: id, status: PartnerCommissionStatus.BLOCKED },
        data: { status: PartnerCommissionStatus.AVAILABLE, withdrawalId: null },
      });
    }

    return withdrawal;
  }

  async payWithdrawal(id: string, dto: PayWithdrawalDto) {
    this.assertAdmin();
    const withdrawal = await this.prisma.partnerWithdrawal.update({
      where: { id },
      data: { status: PartnerWithdrawalStatus.PAID, paidAt: new Date(), paymentReceipt: dto.paymentReceipt },
    });
    await this.prisma.partnerCommission.updateMany({
      where: { withdrawalId: id },
      data: { status: PartnerCommissionStatus.PAID, paidAt: new Date() },
    });
    return withdrawal;
  }

  async getAdminKpis() {
    this.assertAdmin();
    const [trialActive, trialExpired, active, overdue, partnersPending, withdrawalsPending, webhooksFailed] = await Promise.all([
      this.prisma.company.count({ where: { billingStatus: BillingAccountStatus.TRIAL_ACTIVE } }),
      this.prisma.company.count({ where: { billingStatus: BillingAccountStatus.TRIAL_EXPIRED } }),
      this.prisma.company.count({ where: { billingStatus: BillingAccountStatus.ACTIVE } }),
      this.prisma.company.count({ where: { billingStatus: BillingAccountStatus.OVERDUE } }),
      this.prisma.partner.count({ where: { status: PartnerStatus.PENDING } }),
      this.prisma.partnerWithdrawal.count({ where: { status: { in: [PartnerWithdrawalStatus.REQUESTED, PartnerWithdrawalStatus.UNDER_REVIEW] } } }),
      this.prisma.asaasWebhookEvent.count({ where: { status: BillingWebhookStatus.FAILED } }),
    ]);

    const revenue = await this.prisma.billingPayment.aggregate({
      where: { status: { in: [BillingPaymentStatus.RECEIVED, BillingPaymentStatus.CONFIRMED] } },
      _sum: { value: true },
    });

    return {
      accounts: { trialActive, trialExpired, active, overdue },
      partners: { pendingApproval: partnersPending },
      withdrawals: { pendingReview: withdrawalsPending },
      webhooks: { failed: webhooksFailed },
      revenue: { received: revenue._sum.value || 0 },
    };
  }

  private async generateCommissionForPayment(paymentId: string) {
    const payment = await this.prisma.billingPayment.findUnique({
      where: { id: paymentId },
      include: { company: { include: { referredByPartner: true } } },
    });
    if (!payment?.company.referredByPartner || payment.company.referredByPartner.status !== PartnerStatus.APPROVED) return;

    const partner = payment.company.referredByPartner;
    const rate = Number(partner.commissionRate);
    const baseValue = Number(payment.value);
    const amount = (baseValue * rate) / 100;
    const availableAt = new Date();
    availableAt.setDate(availableAt.getDate() + Number(this.config.get<string>('PARTNER_COMMISSION_HOLD_DAYS') || 7));

    await this.prisma.partnerCommission.upsert({
      where: { partnerId_paymentId: { partnerId: partner.id, paymentId } },
      update: {},
      create: {
        partnerId: partner.id,
        companyId: payment.companyId,
        paymentId,
        baseValue: payment.value,
        rate: partner.commissionRate,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        availableAt,
        status: PartnerCommissionStatus.PENDING,
      },
    });
  }

  private async reverseCommissionsForPayment(paymentId: string, status: BillingPaymentStatus) {
    await this.prisma.partnerCommission.updateMany({
      where: { paymentId, status: { in: [PartnerCommissionStatus.PENDING, PartnerCommissionStatus.AVAILABLE, PartnerCommissionStatus.BLOCKED] } },
      data: { status: PartnerCommissionStatus.REVERSED, canceledAt: new Date(), reason: `Pagamento ${status}` },
    });
  }

  private async resolveCompanyIdFromWebhook(dto: AsaasWebhookDto) {
    if (dto.payment) return this.resolveCompanyIdFromPayment(dto.payment);
    if (dto.subscription) return (await this.resolveSubscriptionFromAsaasSubscription(dto.subscription))?.companyId;
    return null;
  }

  private async resolveCompanyIdFromPayment(payment: any) {
    const subscription = await this.resolveSubscriptionFromPayment(payment);
    if (subscription) return subscription.companyId;
    if (payment.externalReference) return payment.externalReference;
    if (payment.customer) {
      const company = await this.prisma.company.findUnique({ where: { asaasCustomerId: payment.customer } });
      if (company) return company.id;
    }
    if (payment.subscription) {
      const subscription = await this.prisma.billingSubscription.findFirst({ where: { asaasSubscriptionId: payment.subscription } });
      if (subscription) return subscription.companyId;
    }
    return null;
  }

  private async resolveSubscriptionFromPayment(payment: any) {
    if (payment.externalReference && this.isUuid(payment.externalReference)) {
      const byReference = await this.prisma.billingSubscription.findUnique({ where: { id: payment.externalReference } });
      if (byReference) return byReference;
    }
    if (payment.subscription) {
      const bySubscription = await this.prisma.billingSubscription.findFirst({ where: { asaasSubscriptionId: payment.subscription } });
      if (bySubscription) return bySubscription;
    }
    if (payment.paymentLink) {
      const byPaymentLink = await this.prisma.billingSubscription.findFirst({ where: { asaasPaymentLinkId: payment.paymentLink } });
      if (byPaymentLink) return byPaymentLink;
    }
    if (payment.subscription) {
      const asaasSubscription = await this.fetchAsaasSubscriptionForWebhook(payment.subscription);
      const byFetchedSubscription = await this.resolveSubscriptionFromAsaasSubscription(asaasSubscription);
      if (byFetchedSubscription) return byFetchedSubscription;
    }
    return null;
  }

  private async resolveSubscriptionFromAsaasSubscription(subscription: any) {
    if (!subscription) return null;
    const filters: Prisma.BillingSubscriptionWhereInput[] = [];
    if (subscription.id) filters.push({ asaasSubscriptionId: subscription.id });
    if (subscription.externalReference && this.isUuid(subscription.externalReference)) filters.push({ id: subscription.externalReference });
    if (subscription.paymentLink) filters.push({ asaasPaymentLinkId: subscription.paymentLink });
    if (!filters.length) return null;
    return this.prisma.billingSubscription.findFirst({ where: { OR: filters } });
  }

  private async fetchAsaasSubscriptionForWebhook(subscriptionId: string) {
    try {
      const subscription = await this.asaas.getSubscription(subscriptionId);
      console.log('[ASAAS WEBHOOK] Assinatura consultada no Asaas:', {
        id: subscription?.id,
        customer: this.extractAsaasCustomerId(subscription) || null,
        externalReference: subscription?.externalReference,
        paymentLink: subscription?.paymentLink,
      });
      return subscription;
    } catch (error) {
      console.log('[ASAAS WEBHOOK] Falha ao consultar assinatura no Asaas:', {
        subscriptionId,
        error: this.asaas.sanitizeError(error),
      });
      return null;
    }
  }

  private mapPaymentStatus(event: string, status?: string): BillingPaymentStatus {
    if (event.includes('RECEIVED')) return BillingPaymentStatus.RECEIVED;
    if (event.includes('CONFIRMED')) return BillingPaymentStatus.CONFIRMED;
    if (event.includes('OVERDUE')) return BillingPaymentStatus.OVERDUE;
    if (event.includes('REFUND')) return BillingPaymentStatus.REFUNDED;
    if (event.includes('CHARGEBACK')) return BillingPaymentStatus.CHARGEBACK;
    if (event.includes('DELETED') || event.includes('CANCELED')) return BillingPaymentStatus.CANCELED;
    if (status && Object.values(BillingPaymentStatus).includes(status as BillingPaymentStatus)) return status as BillingPaymentStatus;
    return BillingPaymentStatus.PENDING;
  }

  private logAsaasWebhookPayload(payload: AsaasWebhookDto) {
    console.log('=== WEBHOOK ASAAS RECEBIDO ===');
    console.log(JSON.stringify(payload, null, 2));
    console.log('Event:', payload.event);
    console.log('Payment ID:', payload.payment?.id);
    console.log('Customer ID:', this.extractAsaasCustomerId(payload.payment) || this.extractAsaasCustomerId(payload.subscription) || this.extractAsaasCustomerId(payload.customer));
    console.log('Payment Customer ID:', this.extractAsaasCustomerId(payload.payment));
    console.log('Subscription Customer ID:', this.extractAsaasCustomerId(payload.subscription));
    console.log('Payment Subscription ID:', payload.payment?.subscription);
    console.log('Subscription ID:', payload.subscription?.id);
    console.log('Payment Link ID:', payload.payment?.paymentLink || payload.subscription?.paymentLink);
    console.log('External Reference:', payload.payment?.externalReference || payload.subscription?.externalReference);
  }

  private isUuid(value: unknown) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private isAsaasDomainConfigError(error: any) {
    const rawMessage = [
      error?.response?.data?.errors?.[0]?.description,
      error?.response?.data?.message,
      error?.message,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return rawMessage.includes('dominio') || rawMessage.includes('domínio');
  }

  private async resolvePartner(partnerId?: string) {
    if (partnerId) {
      const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, include: { company: true, user: true } });
      if (!partner) throw new NotFoundException('Parceiro nao encontrado');
      if (!this.isMaster()) {
        const tenantId = this.cls.get<string>('tenantId');
        if (partner.companyId !== tenantId) throw new ForbiddenException('Acesso negado ao parceiro');
      }
      return partner;
    }

    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) throw new BadRequestException('Empresa do parceiro nao encontrada');
    const partner = await this.prisma.partner.findUnique({ where: { companyId: tenantId }, include: { company: true, user: true } });
    if (!partner) throw new NotFoundException('Perfil de parceiro nao encontrado');
    return partner;
  }

  private async getPartnerSummary(partnerId: string) {
    const rows = await this.prisma.partnerCommission.groupBy({
      by: ['status'],
      where: { partnerId },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return rows.reduce((acc, row) => {
      acc[row.status] = { amount: row._sum.amount || 0, count: row._count._all };
      return acc;
    }, {} as Record<string, any>);
  }

  private async sumAvailableCommissions(partnerId: string, commissionIds?: string[]) {
    const result = await this.prisma.partnerCommission.aggregate({
      where: {
        partnerId,
        status: PartnerCommissionStatus.AVAILABLE,
        ...(commissionIds?.length ? { id: { in: commissionIds } } : {}),
      },
      _sum: { amount: true },
    });
    return new Prisma.Decimal(result._sum.amount || 0);
  }

  private async generatePartnerCode(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const prefix = (company?.name || 'PARCEIRO').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'PARC';
    let code = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
    while (await this.prisma.partner.findUnique({ where: { code } })) {
      code = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
    }
    return code;
  }

  private async assertCompanyAccess(companyId: string) {
    if (this.isMaster()) return;
    const tenantId = this.cls.get<string>('tenantId');
    if (tenantId !== companyId) throw new ForbiddenException('Acesso negado a empresa');
  }

  private assertAdmin() {
    this.assertMaster();
  }

  private assertMaster() {
    if (!this.isMaster()) throw new ForbiddenException('Apenas MASTER pode executar esta acao');
  }

  private isAdmin() {
    const role = this.cls.get<string>('userRole') as UserRole;
    return role === UserRole.MASTER || role === UserRole.ADMIN || this.cls.get<boolean>('isMaster');
  }

  private isMaster() {
    const role = this.cls.get<string>('userRole') as UserRole;
    return role === UserRole.MASTER || this.cls.get<boolean>('isMaster');
  }

  private companyBillingSelect() {
    return {
      id: true,
      name: true,
      cnpj: true,
      email: true,
      billingStatus: true,
      trialStart: true,
      trialEnd: true,
      asaasCustomerId: true,
      referredByPartnerId: true,
    };
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private buildTrialPeriod(trialDays = 7) {
    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    return { trialStart, trialEnd };
  }

  private async buildTrialPeriodFromSubscription(subscriptionId: string) {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, company: true },
    });
    if (!subscription) return null;
    const trialPeriod = this.buildTrialPeriod(subscription.plan.trialDays);
    return {
      trialStart: subscription.company.trialStart || trialPeriod.trialStart,
      trialEnd: subscription.company.trialEnd || trialPeriod.trialEnd,
    };
  }

  private extractAsaasCustomerId(payload: any): string | undefined {
    const customer = payload?.customer;
    if (typeof customer === 'string' && customer.trim()) return customer;
    if (customer?.id) return customer.id;
    if (payload?.customerId) return payload.customerId;
    if (payload?.customer?.object === 'customer' && payload.customer.id) return payload.customer.id;
    return undefined;
  }
}
