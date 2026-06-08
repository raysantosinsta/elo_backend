/* eslint-disable prettier/prettier */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { BillingAccountStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';

type BillingGuardRequest = {
  originalUrl?: string;
  url?: string;
  user?: {
    companyId?: string | null;
    role?: UserRole;
  };
};

@Injectable()
export class BillingAccessGuard implements CanActivate {
  private readonly allowedPrefixes = ['/auth', '/metrics'];
  private readonly allowedBillingPrefixes = [
    '/billing/plans',
    '/billing/checkout',
    '/billing/me',
  ];

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get<string>('BILLING_ACCESS_GUARD_ENABLED') === 'false') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<BillingGuardRequest>();
    const path = this.normalizePath(request.originalUrl || request.url || '');
    if (
      this.allowedPrefixes.some((prefix) => path.startsWith(prefix)) ||
      this.allowedBillingPrefixes.some((prefix) => path.startsWith(prefix))
    ) {
      return true;
    }

    const user = request.user;
    if (!user?.companyId || user.role === UserRole.MASTER) {
      return true;
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { billingStatus: true, trialEnd: true },
    });

    if (!company) return true;

    const isTrialExpired =
      company.billingStatus === BillingAccountStatus.TRIAL_ACTIVE &&
      company.trialEnd &&
      company.trialEnd.getTime() < Date.now();

    if (
      !isTrialExpired &&
      (company.billingStatus === BillingAccountStatus.ACTIVE ||
        company.billingStatus === BillingAccountStatus.TRIAL_ACTIVE)
    ) {
      return true;
    }

    throw new HttpException(
      {
        message: 'Acesso bloqueado por pendencia financeira ou trial expirado.',
        code: 'BILLING_ACCESS_BLOCKED',
        billingStatus: isTrialExpired ? BillingAccountStatus.TRIAL_EXPIRED : company.billingStatus,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  private normalizePath(path: string) {
    const normalized = path.split('?')[0] || '/';
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }
}
