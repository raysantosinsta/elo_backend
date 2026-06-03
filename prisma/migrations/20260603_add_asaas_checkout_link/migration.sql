-- AlterTable
ALTER TABLE "billing_subscriptions" ADD COLUMN IF NOT EXISTS "asaas_payment_link_id" VARCHAR(120),
ADD COLUMN IF NOT EXISTS "checkout_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscriptions_asaas_payment_link_id_key" ON "billing_subscriptions"("asaas_payment_link_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "billing_subscriptions_asaas_payment_link_id_idx" ON "billing_subscriptions"("asaas_payment_link_id");
