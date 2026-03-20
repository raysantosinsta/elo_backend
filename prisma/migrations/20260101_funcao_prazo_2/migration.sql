-- AlterTable
ALTER TABLE "public"."itens_etapas_prazo" ADD COLUMN     "ordem" INTEGER NOT NULL,
ADD COLUMN     "prazo_real" TIMESTAMP(3),
ADD COLUMN     "prazo_sugerido" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDENTE';

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_status_idx" ON "public"."itens_etapas_prazo"("status");

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_ordem_idx" ON "public"."itens_etapas_prazo"("ordem");