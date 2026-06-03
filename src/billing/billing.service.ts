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

  async expireTrials() {
    this.assertMaster();
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

    const pending = await this.prisma.billingSubscription.create({
      data: {
        companyId: dto.companyId,
        planId: plan.id,
        value: plan.price,
        cycle: plan.period,
        status: BillingSubscriptionStatus.PENDING,
      },
    });

    try {
      const paymentLink = await this.asaas.createPaymentLink({
        name: `Assinatura ${plan.name}`,
        description: plan.description || `Assinatura ${plan.name} - Elospro`,
        value: Number(plan.price),
        billingType: dto.billingType || 'UNDEFINED',
        chargeType: 'RECURRENT',
        subscriptionCycle: plan.period === PlanPeriod.YEARLY ? 'YEARLY' : 'MONTHLY',
        dueDateLimitDays: 3,
        externalReference: pending.id,
        notificationEnabled: true,
        callback: {
          successUrl: this.config.get<string>('ASAAS_CHECKOUT_SUCCESS_URL') || this.config.get<string>('APP_URL'),
          autoRedirect: true,
        },
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

  async getCompanyBilling(companyId?: string) {
    const resolvedCompanyId = companyId || this.cls.get<string>('tenantId');
    if (!resolvedCompanyId) throw new BadRequestException('Empresa nao informada');
    await this.assertCompanyAccess(resolvedCompanyId);
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

    const eventId = dto.id || `${dto.event}:${dto.payment?.id || dto.subscription?.id || Date.now()}`;
    const existing = await this.prisma.asaasWebhookEvent.findUnique({ where: { eventId } });
    if (existing) {
      await this.prisma.asaasWebhookEvent.update({
        where: { eventId },
        data: { status: BillingWebhookStatus.DUPLICATED },
      });
      return { duplicated: true, eventId };
    }

    const companyId = await this.resolveCompanyIdFromWebhook(dto);
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
    if (dto.payment) {
      await this.upsertPaymentFromAsaas(dto.event, dto.payment, companyId);
    }
    if (dto.subscription) {
      await this.updateSubscriptionFromAsaas(dto.event, dto.subscription);
    }
  }

  private async upsertPaymentFromAsaas(event: string, payment: any, companyId?: string | null) {
    const resolvedCompanyId = companyId || await this.resolveCompanyIdFromPayment(payment);
    if (!resolvedCompanyId) return;
    const status = this.mapPaymentStatus(event, payment.status);
    const subscription = await this.resolveSubscriptionFromPayment(payment);

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
      await this.prisma.company.update({ where: { id: resolvedCompanyId }, data: { billingStatus: BillingAccountStatus.ACTIVE } });
      if (subscription) {
        await this.prisma.billingSubscription.update({
          where: { id: subscription.id },
          data: {
            status: BillingSubscriptionStatus.ACTIVE,
            asaasSubscriptionId: payment.subscription || subscription.asaasSubscriptionId,
            nextDueDate: payment.dueDate ? new Date(`${payment.dueDate}T00:00:00`) : subscription.nextDueDate,
          },
        });
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
    const local = subscription.id
      ? await this.prisma.billingSubscription.findFirst({
          where: {
            OR: [
              { asaasSubscriptionId: subscription.id },
              ...(subscription.externalReference ? [{ id: subscription.externalReference }] : []),
            ],
          },
        })
      : null;
    if (!local) return;
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

  async releasePendingCommissions() {
    this.assertAdmin();
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
    if (dto.subscription?.id) {
      const subscription = await this.prisma.billingSubscription.findFirst({ where: { asaasSubscriptionId: dto.subscription.id } });
      return subscription?.companyId;
    }
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
    if (payment.externalReference) {
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
    return null;
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
}
