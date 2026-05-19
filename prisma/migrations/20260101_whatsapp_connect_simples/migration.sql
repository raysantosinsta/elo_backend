-- DropForeignKey
ALTER TABLE "whatsapp_connections" DROP CONSTRAINT "whatsapp_connections_company_id_fkey";

-- DropIndex
DROP INDEX "whatsapp_connections_created_at_idx";

-- DropIndex
DROP INDEX "whatsapp_connections_status_idx";

-- DropIndex
DROP INDEX "whatsapp_connections_whatsapp_id_idx";

-- AlterTable
ALTER TABLE "whatsapp_connections" DROP COLUMN "bot_flow_id",
DROP COLUMN "complation_message",
DROP COLUMN "expires_inactive_message",
DROP COLUMN "expires_ticket",
DROP COLUMN "greeting_message",
DROP COLUMN "is_default",
DROP COLUMN "last_verified",
DROP COLUMN "max_use_bot_queues",
DROP COLUMN "meta_business_id",
DROP COLUMN "meta_phone_number_id",
DROP COLUMN "meta_waba_id",
DROP COLUMN "out_of_hours_message",
DROP COLUMN "phone_number",
DROP COLUMN "prompt_id",
DROP COLUMN "provider",
DROP COLUMN "qr_code_updated_at",
DROP COLUMN "queue_ids",
DROP COLUMN "rating_message",
DROP COLUMN "time_use_bot_queues",
DROP COLUMN "transfer_queue_id",
DROP COLUMN "whatsapp_id",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;