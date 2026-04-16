-- AlterTable
ALTER TABLE "paradas_rota" ADD COLUMN     "task_id" UUID;

-- AddForeignKey
ALTER TABLE "paradas_rota" ADD CONSTRAINT "paradas_rota_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tarefas"("id") ON DELETE SET NULL ON UPDATE CASCADE;