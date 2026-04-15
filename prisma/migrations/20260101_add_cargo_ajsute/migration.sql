-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "cargo_profissional",
ADD COLUMN     "cargo_profissional_id" UUID;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cargo_profissional_id_fkey" FOREIGN KEY ("cargo_profissional_id") REFERENCES "cargos_empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;