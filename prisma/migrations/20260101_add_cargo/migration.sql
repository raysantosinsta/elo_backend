-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "cargo_empresa_id" UUID;

-- CreateTable
CREATE TABLE "cargos_empresa" (
    "id" UUID NOT NULL,
    "status" "SimpleStatus" NOT NULL DEFAULT 'ACTIVE',
    "nome" VARCHAR(100) NOT NULL,
    "descricao" TEXT,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "empresa_id" UUID NOT NULL,
    "user_create_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargos_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cargos_empresa_empresa_id_idx" ON "cargos_empresa"("empresa_id");

-- CreateIndex
CREATE INDEX "cargos_empresa_status_idx" ON "cargos_empresa"("status");

-- CreateIndex
CREATE INDEX "cargos_empresa_nivel_idx" ON "cargos_empresa"("nivel");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_empresa_empresa_id_nome_key" ON "cargos_empresa"("empresa_id", "nome");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cargo_empresa_id_fkey" FOREIGN KEY ("cargo_empresa_id") REFERENCES "cargos_empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_empresa" ADD CONSTRAINT "cargos_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE 
CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_empresa" ADD CONSTRAINT "cargos_empresa_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_empresa" ADD CONSTRAINT "cargos_empresa_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
