-- CreateEnum
CREATE TYPE "BillingAccountStatus" AS ENUM ('TRIAL_ACTIVE', 'TRIAL_EXPIRED', 'ACTIVE', 'OVERDUE', 'BLOCKED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'OVERDUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'RECEIVED', 'CONFIRMED', 'OVERDUE', 'REFUNDED', 'CHARGEBACK', 'CANCELED');

-- CreateEnum
CREATE TYPE "BillingWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATED', 'FAILED');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PartnerCommissionStatus" AS ENUM ('PENDING', 'AVAILABLE', 'BLOCKED', 'PAID', 'CANCELED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PartnerWithdrawalStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAID', 'CANCELED');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "asaas_customer_id" VARCHAR(120),
ADD COLUMN     "fim_teste" TIMESTAMP(3),
ADD COLUMN     "inicio_teste" TIMESTAMP(3),
ADD COLUMN     "parceiro_indicador_id" UUID,
ADD COLUMN     "status_financeiro" "BillingAccountStatus" NOT NULL DEFAULT 'TRIAL_ACTIVE';

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "plano_expira_em";

-- CreateTable
CREATE TABLE "billing_plans" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "descricao" TEXT,
    "preco" DECIMAL(10,2) NOT NULL,
    "periodo" "PlanPeriod" NOT NULL DEFAULT 'MONTHLY',
    "dias_teste" INTEGER NOT NULL DEFAULT 7,
    "limite_usuarios" INTEGER,
    "recursos" JSONB,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_subscriptions" (
    "id" UUID NOT NULL,
    "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "asaas_subscription_id" VARCHAR(120),
    "valor" DECIMAL(10,2) NOT NULL,
    "ciclo" "PlanPeriod" NOT NULL DEFAULT 'MONTHLY',
    "proximo_vencimento" TIMESTAMP(3),
    "inicio_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "plano_id" UUID NOT NULL,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_payments" (
    "id" UUID NOT NULL,
    "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "asaas_payment_id" VARCHAR(120),
    "tipo_cobranca" VARCHAR(40),
    "valor" DECIMAL(10,2) NOT NULL,
    "valor_liquido" DECIMAL(10,2),
    "vencimento" TIMESTAMP(3),
    "data_pagamento" TIMESTAMP(3),
    "invoice_url" TEXT,
    "bank_slip_url" TEXT,
    "pix_qr_code" TEXT,
    "payload_bruto" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "assinatura_id" UUID,

    CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asaas_webhook_events" (
    "id" UUID NOT NULL,
    "asaas_event_id" VARCHAR(160) NOT NULL,
    "tipo_evento" VARCHAR(120) NOT NULL,
    "status" "BillingWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload_bruto" JSONB NOT NULL,
    "processado_em" TIMESTAMP(3),
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresa_id" UUID,

    CONSTRAINT "asaas_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "codigo" VARCHAR(40) NOT NULL,
    "percentual_comissao" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "aprovado_em" TIMESTAMP(3),
    "motivo_rejeicao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID,
    "aprovado_por_id" UUID,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_referrals" (
    "id" UUID NOT NULL,
    "nome_lead" VARCHAR(150) NOT NULL,
    "documento" VARCHAR(20),
    "email" VARCHAR(255),
    "telefone" VARCHAR(30),
    "status" VARCHAR(40) NOT NULL DEFAULT 'TRIAL',
    "empresa_convertida_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "parceiro_id" UUID NOT NULL,

    CONSTRAINT "partner_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_commissions" (
    "id" UUID NOT NULL,
    "status" "PartnerCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "valor_base" DECIMAL(10,2) NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "valor_comissao" DECIMAL(10,2) NOT NULL,
    "disponivel_em" TIMESTAMP(3),
    "pago_em" TIMESTAMP(3),
    "cancelado_em" TIMESTAMP(3),
    "motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "parceiro_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "pagamento_id" UUID NOT NULL,
    "saque_id" UUID,

    CONSTRAINT "partner_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_withdrawals" (
    "id" UUID NOT NULL,
    "status" "PartnerWithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "valor" DECIMAL(10,2) NOT NULL,
    "nfse_url" TEXT,
    "nfse_numero" VARCHAR(80),
    "nfse_documento" VARCHAR(20),
    "nfse_emitida_em" TIMESTAMP(3),
    "revisado_em" TIMESTAMP(3),
    "motivo_reprovacao" TEXT,
    "pago_em" TIMESTAMP(3),
    "comprovante_pagamento" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "parceiro_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "revisado_por_id" UUID,

    CONSTRAINT "partner_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_plans_ativo_idx" ON "billing_plans"("ativo");

-- CreateIndex
CREATE INDEX "billing_plans_periodo_idx" ON "billing_plans"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_asaas_subscription_id_key" ON "billing_subscriptions"("asaas_subscription_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_empresa_id_idx" ON "billing_subscriptions"("empresa_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_plano_id_idx" ON "billing_subscriptions"("plano_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_status_idx" ON "billing_subscriptions"("status");

-- CreateIndex
CREATE INDEX "billing_subscriptions_proximo_vencimento_idx" ON "billing_subscriptions"("proximo_vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "billing_payments_asaas_payment_id_key" ON "billing_payments"("asaas_payment_id");

-- CreateIndex
CREATE INDEX "billing_payments_empresa_id_idx" ON "billing_payments"("empresa_id");

-- CreateIndex
CREATE INDEX "billing_payments_assinatura_id_idx" ON "billing_payments"("assinatura_id");

-- CreateIndex
CREATE INDEX "billing_payments_status_idx" ON "billing_payments"("status");

-- CreateIndex
CREATE INDEX "billing_payments_vencimento_idx" ON "billing_payments"("vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "asaas_webhook_events_asaas_event_id_key" ON "asaas_webhook_events"("asaas_event_id");

-- CreateIndex
CREATE INDEX "asaas_webhook_events_tipo_evento_idx" ON "asaas_webhook_events"("tipo_evento");

-- CreateIndex
CREATE INDEX "asaas_webhook_events_status_idx" ON "asaas_webhook_events"("status");

-- CreateIndex
CREATE INDEX "asaas_webhook_events_empresa_id_idx" ON "asaas_webhook_events"("empresa_id");

-- CreateIndex
CREATE INDEX "asaas_webhook_events_criado_em_idx" ON "asaas_webhook_events"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "partners_codigo_key" ON "partners"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "partners_empresa_id_key" ON "partners"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_usuario_id_key" ON "partners"("usuario_id");

-- CreateIndex
CREATE INDEX "partners_status_idx" ON "partners"("status");

-- CreateIndex
CREATE INDEX "partners_empresa_id_idx" ON "partners"("empresa_id");

-- CreateIndex
CREATE INDEX "partners_usuario_id_idx" ON "partners"("usuario_id");

-- CreateIndex
CREATE INDEX "partner_referrals_parceiro_id_idx" ON "partner_referrals"("parceiro_id");

-- CreateIndex
CREATE INDEX "partner_referrals_empresa_convertida_id_idx" ON "partner_referrals"("empresa_convertida_id");

-- CreateIndex
CREATE INDEX "partner_referrals_status_idx" ON "partner_referrals"("status");

-- CreateIndex
CREATE INDEX "partner_commissions_parceiro_id_idx" ON "partner_commissions"("parceiro_id");

-- CreateIndex
CREATE INDEX "partner_commissions_empresa_id_idx" ON "partner_commissions"("empresa_id");

-- CreateIndex
CREATE INDEX "partner_commissions_pagamento_id_idx" ON "partner_commissions"("pagamento_id");

-- CreateIndex
CREATE INDEX "partner_commissions_status_idx" ON "partner_commissions"("status");

-- CreateIndex
CREATE INDEX "partner_commissions_disponivel_em_idx" ON "partner_commissions"("disponivel_em");

-- CreateIndex
CREATE UNIQUE INDEX "partner_commissions_parceiro_id_pagamento_id_key" ON "partner_commissions"("parceiro_id", "pagamento_id");

-- CreateIndex
CREATE INDEX "partner_withdrawals_parceiro_id_idx" ON "partner_withdrawals"("parceiro_id");

-- CreateIndex
CREATE INDEX "partner_withdrawals_empresa_id_idx" ON "partner_withdrawals"("empresa_id");

-- CreateIndex
CREATE INDEX "partner_withdrawals_status_idx" ON "partner_withdrawals"("status");

-- CreateIndex
CREATE INDEX "partner_withdrawals_criado_em_idx" ON "partner_withdrawals"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_asaas_customer_id_key" ON "empresas"("asaas_customer_id");

-- CreateIndex
CREATE INDEX "empresas_status_financeiro_idx" ON "empresas"("status_financeiro");

-- CreateIndex
CREATE INDEX "empresas_fim_teste_idx" ON "empresas"("fim_teste");

-- CreateIndex
CREATE INDEX "empresas_parceiro_indicador_id_idx" ON "empresas"("parceiro_indicador_id");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_parceiro_indicador_id_fkey" FOREIGN KEY ("parceiro_indicador_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "billing_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asaas_webhook_events" ADD CONSTRAINT "asaas_webhook_events_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_aprovado_por_id_fkey" FOREIGN KEY ("aprovado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "billing_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_saque_id_fkey" FOREIGN KEY ("saque_id") REFERENCES "partner_withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_withdrawals" ADD CONSTRAINT "partner_withdrawals_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_withdrawals" ADD CONSTRAINT "partner_withdrawals_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_withdrawals" ADD CONSTRAINT "partner_withdrawals_revisado_por_id_fkey" FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;