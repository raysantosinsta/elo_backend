-- AlterTable
ALTER TABLE "rotas" ADD COLUMN     "distancia_total_metros" DOUBLE PRECISION,
ADD COLUMN     "duracao_total_segundos" INTEGER,
ADD COLUMN     "otimizado_em" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "paradas_rota" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(200),
    "endereco" VARCHAR(300) NOT NULL,
    "complemento" VARCHAR(100),
    "bairro" VARCHAR(100),
    "cidade" VARCHAR(100) NOT NULL,
    "estado" VARCHAR(2) NOT NULL,
    "cep" VARCHAR(9) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "visitado_em" TIMESTAMP(3),
    "visitado" BOOLEAN NOT NULL DEFAULT false,
    "rota_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paradas_rota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paradas_rota_rota_id_idx" ON "paradas_rota"("rota_id");

-- CreateIndex
CREATE INDEX "paradas_rota_ordem_idx" ON "paradas_rota"("ordem");

-- CreateIndex
CREATE INDEX "paradas_rota_empresa_id_idx" ON "paradas_rota"("empresa_id");

-- AddForeignKey
ALTER TABLE "paradas_rota" ADD CONSTRAINT "paradas_rota_rota_id_fkey" FOREIGN KEY ("rota_id") REFERENCES "rotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paradas_rota" ADD CONSTRAINT "paradas_rota_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;