
prisma: https://www.linkedin.com/pulse/guia-definitivo-hotfix-de-migrations-prisma-em-produ%C3%A7%C3%A3o-santos-rbkte/?trackingId=yQLnT1LxaOZfymhsw6LaMw%3D%3D

npx prisma migrate diff \
  --from-url "postgresql://postgres.myyysbvhhicrdrmqmgqp:TjxEcRyrxpGmBSNL@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
  --to-schema-datamodel prisma/schema.prisma \
  --script 

  mkdir prisma/migrations/20260101_task_RESCHEDULED

  npx prisma migrate resolve --applied 20260101_task_RESCHEDULED

   npx prisma generate

   ____ refazer caso nao seja certo

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

apliquei isso

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "cargo_profissional",
ADD COLUMN     "cargo_profissional_id" UUID;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cargo_profissional_id_fkey" FOREIGN KEY ("cargo_profissional_id") REFERENCES "cargos_empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;



rodar seed no nestjs -> npx prisma db seed
