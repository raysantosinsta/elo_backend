-- CreateEnum
CREATE TYPE "SupplierCategory" AS ENUM ('MATERIAL_ONLY', 'SERVICE_ONLY', 'HYBRID');

-- AlterTable
ALTER TABLE "itens_fluxo"
ADD COLUMN "fornecedor_id" UUID,
ALTER COLUMN "data_do_inicio_da_producao"
SET
  DATA TYPE TIMESTAMP(3),
ALTER COLUMN "data_de_entrega_da_producao"
SET
  DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "suppliers"
ADD COLUMN "categoria" "SupplierCategory" NOT NULL DEFAULT 'MATERIAL_ONLY';

-- AddForeignKey
ALTER TABLE "itens_fluxo" ADD CONSTRAINT "itens_fluxo_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE;