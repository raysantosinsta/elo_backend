CREATE TABLE "templates_fluxo" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "estrutura" JSONB NOT NULL,
    "empresa_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_fluxo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_fluxo_empresa_id_idx" ON "templates_fluxo"("empresa_id");

-- AddForeignKey
ALTER TABLE "templates_fluxo" ADD CONSTRAINT "templates_fluxo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;