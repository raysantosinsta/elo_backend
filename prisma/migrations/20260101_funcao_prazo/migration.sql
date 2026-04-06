-- AlterTable
ALTER TABLE "public"."etapas_fluxo"
ADD COLUMN "prazo_sugerido_dias" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE
  "public"."itens_etapas_prazo" (
    "id" UUID NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "alterado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,
    "item_id" UUID NOT NULL,
    "etapa_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "itens_etapas_prazo_pkey" PRIMARY KEY ("id")
  );

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_item_id_idx" ON "public"."itens_etapas_prazo" ("item_id");

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_etapa_id_idx" ON "public"."itens_etapas_prazo" ("etapa_id");

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_empresa_id_idx" ON "public"."itens_etapas_prazo" ("empresa_id");

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_prazo_idx" ON "public"."itens_etapas_prazo" ("prazo");

-- CreateIndex
CREATE UNIQUE INDEX "itens_etapas_prazo_item_id_etapa_id_key" ON "public"."itens_etapas_prazo" ("item_id", "etapa_id");

-- AddForeignKey
ALTER TABLE "public"."itens_etapas_prazo" ADD CONSTRAINT "itens_etapas_prazo_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."itens_fluxo" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."itens_etapas_prazo" ADD CONSTRAINT "itens_etapas_prazo_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas_fluxo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."itens_etapas_prazo" ADD CONSTRAINT "itens_etapas_prazo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;