/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingAccountStatus, BillingSubscriptionStatus, PartnerStatus, PartnerWithdrawalStatus, PlanPeriod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateBillingPlanDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ enum: PlanPeriod })
  @IsOptional()
  @IsEnum(PlanPeriod)
  period?: PlanPeriod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  userLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  features?: Record<string, any>;
}

export class UpdateBillingPlanDto extends CreateBillingPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}

export class StartTrialDto {
  @ApiProperty()
  @IsUUID()
  companyId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partnerCode?: string;
}

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsUUID()
  companyId: string;

  @ApiProperty()
  @IsUUID()
  planId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingType?: string;
}

export class CreateCheckoutDto {
  @ApiProperty()
  @IsUUID()
  companyId: string;

  @ApiProperty()
  @IsUUID()
  planId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingType?: string;
}

export class UpdateBillingStatusDto {
  @ApiProperty({ enum: BillingAccountStatus })
  @IsEnum(BillingAccountStatus)
  status: BillingAccountStatus;
}

export class CreatePartnerDto {
  @ApiProperty()
  @IsUUID()
  companyId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;
}

export class ReviewPartnerDto {
  @ApiProperty({ enum: PartnerStatus })
  @IsEnum(PartnerStatus)
  status: PartnerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectedReason?: string;
}

export class CreateReferralDto {
  @ApiProperty()
  @IsString()
  leadName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  document?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

export class RequestWithdrawalDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty()
  @IsString()
  nfseUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nfseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nfseDocument?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nfseIssuedAt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  commissionIds?: string[];
}

export class ReviewWithdrawalDto {
  @ApiProperty({ enum: PartnerWithdrawalStatus })
  @IsEnum(PartnerWithdrawalStatus)
  status: PartnerWithdrawalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class PayWithdrawalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentReceipt?: string;
}

export class AsaasWebhookDto {
  @ApiProperty()
  @IsString()
  event: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payment?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  subscription?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  customer?: Record<string, any>;
}

export class ListCommissionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

