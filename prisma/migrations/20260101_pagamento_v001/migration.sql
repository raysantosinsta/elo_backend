-- AlterTable
ALTER TABLE "billing_subscriptions" ADD COLUMN     "asaas_payment_link_id" VARCHAR(120),
ADD COLUMN     "checkout_url" TEXT;

-- AlterTable
ALTER TABLE "rotas" ADD COLUMN     "consumo_combustivel_litros" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_asaas_payment_link_id_key" ON "billing_subscriptions"("asaas_payment_link_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_asaas_payment_link_id_idx" ON "billing_subscriptions"("asaas_payment_link_id");