
prisma: https://www.linkedin.com/pulse/guia-definitivo-hotfix-de-migrations-prisma-em-produ%C3%A7%C3%A3o-santos-rbkte/?trackingId=yQLnT1LxaOZfymhsw6LaMw%3D%3D

npx prisma migrate diff \
  --from-url "postgresql://postgres.myyysbvhhicrdrmqmgqp:TjxEcRyrxpGmBSNL@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
  --to-schema-datamodel prisma/schema.prisma \
  --script 

  mkdir prisma/migrations/20260101_funcao_prazo_3

  npx prisma migrate resolve --applied 20260101_funcao_prazo_3


   npx prisma generate

   ____ refazer caso nao seja certo

   -- AlterTable
ALTER TABLE "public"."etapas_fluxo" ADD COLUMN     "prazo_sugerido_dias" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."itens_etapas_prazo" (
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
CREATE INDEX "itens_etapas_prazo_item_id_idx" ON "public"."itens_etapas_prazo"("item_id");

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_etapa_id_idx" ON "public"."itens_etapas_prazo"("etapa_id");

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_empresa_id_idx" ON "public"."itens_etapas_prazo"("empresa_id");

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_prazo_idx" ON "public"."itens_etapas_prazo"("prazo");

-- CreateIndex
CREATE UNIQUE INDEX "itens_etapas_prazo_item_id_etapa_id_key" ON "public"."itens_etapas_prazo"("item_id", "etapa_id");

-- AddForeignKey
ALTER TABLE "public"."itens_etapas_prazo" ADD CONSTRAINT "itens_etapas_prazo_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."itens_fluxo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."itens_etapas_prazo" ADD CONSTRAINT "itens_etapas_prazo_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas_fluxo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."itens_etapas_prazo" ADD CONSTRAINT "itens_etapas_prazo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

--------------------- funcao_prazo_2

-- AlterTable
ALTER TABLE "public"."itens_etapas_prazo" ADD COLUMN     "ordem" INTEGER NOT NULL,
ADD COLUMN     "prazo_real" TIMESTAMP(3),
ADD COLUMN     "prazo_sugerido" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDENTE';

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_status_idx" ON "public"."itens_etapas_prazo"("status");

-- CreateIndex
CREATE INDEX "itens_etapas_prazo_ordem_idx" ON "public"."itens_etapas_prazo"("ordem");

------------------------ funcao_prazo_3

-- AlterTable
ALTER TABLE "public"."itens_etapas_prazo" ADD COLUMN     "baseado_em_prazo_sugerido" INTEGER;