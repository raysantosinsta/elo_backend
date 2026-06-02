-- AlterTable
ALTER TABLE "rotas" DROP COLUMN "consumo_combustivel_litros",
ADD COLUMN     "combustivel_previsto" DOUBLE PRECISION,
ADD COLUMN     "combustivel_real" DOUBLE PRECISION,
ADD COLUMN     "distancia_real" DOUBLE PRECISION,
ADD COLUMN     "finalizado_em" TIMESTAMP(3),
ADD COLUMN     "iniciado_em" TIMESTAMP(3),
ADD COLUMN     "tempo_real" INTEGER;