-- AlterTable
ALTER TABLE "public"."etapas_fluxo" DROP COLUMN "prazo_sugerido_dias",
ADD COLUMN     "dias_padrao" INTEGER DEFAULT 1;