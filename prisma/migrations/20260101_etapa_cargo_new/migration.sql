-- AlterTable
ALTER TABLE "etapas_fluxo" ADD COLUMN     "cargo_permitido" VARCHAR(100);

-- AlterTable
ALTER TABLE "fluxos_produto" DROP COLUMN "cargo_permitido";