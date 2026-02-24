-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,     
    "usuario_id" UUID NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" UUID NOT NULL,
    "dados_antigos" JSONB,
    "dados_novos" JSONB,
    "metadados" JSONB,
    "empresa_id" UUID,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_acao_idx" ON "auditoria"("acao");

-- CreateIndex
CREATE INDEX "auditoria_entidade_idx" ON "auditoria"("entidade");

-- CreateIndex
CREATE INDEX "auditoria_entidade_id_idx" ON "auditoria"("entidade_id");

-- CreateIndex
CREATE INDEX "auditoria_empresa_id_idx" ON "auditoria"("empresa_id");

-- CreateIndex
CREATE INDEX "auditoria_criado_em_idx" ON "auditoria"("criado_em");

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;