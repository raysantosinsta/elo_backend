/*
  Warnings:

  - You are about to drop the column `empresa_id` on the `assinaturas` table. All the data in the column will be lost.
  - You are about to drop the column `empresa_id` on the `audios_tarefas` table. All the data in the column will be lost.
  - You are about to drop the column `empresa_id` on the `colunas_kanban` table. All the data in the column will be lost.
  - You are about to drop the column `empresa_id` on the `enderecos_tarefas` table. All the data in the column will be lost.
  - You are about to drop the column `empresa_id` on the `imagens_tarefas` table. All the data in the column will be lost.
  - You are about to drop the column `empresa_id` on the `notificacoes` table. All the data in the column will be lost.
  - You are about to drop the column `empresa_id` on the `tarefas` table. All the data in the column will be lost.
  - You are about to drop the column `empresa_id` on the `videos_tarefas` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[contador_id]` on the table `assinaturas` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contador_id,titulo]` on the table `colunas_kanban` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `contador_id` to the `assinaturas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contador_id` to the `audios_tarefas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contador_id` to the `enderecos_tarefas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contador_id` to the `imagens_tarefas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contador_id` to the `notificacoes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contador_id` to the `tarefas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contador_id` to the `videos_tarefas` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "assinaturas" DROP CONSTRAINT "assinaturas_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "audios_tarefas" DROP CONSTRAINT "audios_tarefas_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "colunas_kanban" DROP CONSTRAINT "colunas_kanban_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "enderecos_tarefas" DROP CONSTRAINT "enderecos_tarefas_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "imagens_tarefas" DROP CONSTRAINT "imagens_tarefas_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "tarefas" DROP CONSTRAINT "tarefas_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "videos_tarefas" DROP CONSTRAINT "videos_tarefas_empresa_id_fkey";

-- DropIndex
DROP INDEX "assinaturas_empresa_id_key";

-- DropIndex
DROP INDEX "audios_tarefas_empresa_id_idx";

-- DropIndex
DROP INDEX "colunas_kanban_empresa_id_idx";

-- DropIndex
DROP INDEX "colunas_kanban_empresa_id_titulo_key";

-- DropIndex
DROP INDEX "enderecos_tarefas_empresa_id_idx";

-- DropIndex
DROP INDEX "imagens_tarefas_empresa_id_idx";

-- DropIndex
DROP INDEX "notificacoes_empresa_id_idx";

-- DropIndex
DROP INDEX "tarefas_empresa_id_idx";

-- DropIndex
DROP INDEX "tarefas_empresa_id_status_idx";

-- DropIndex
DROP INDEX "videos_tarefas_empresa_id_idx";

-- AlterTable
ALTER TABLE "assinaturas" DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "audios_tarefas" DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "colunas_kanban" DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID;

-- AlterTable
ALTER TABLE "enderecos_tarefas" DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "imagens_tarefas" DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "notificacoes" DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "tarefas" DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "videos_tarefas" DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_contador_id_key" ON "assinaturas"("contador_id");

-- CreateIndex
CREATE INDEX "audios_tarefas_contador_id_idx" ON "audios_tarefas"("contador_id");

-- CreateIndex
CREATE INDEX "colunas_kanban_contador_id_idx" ON "colunas_kanban"("contador_id");

-- CreateIndex
CREATE UNIQUE INDEX "colunas_kanban_contador_id_titulo_key" ON "colunas_kanban"("contador_id", "titulo");

-- CreateIndex
CREATE INDEX "enderecos_tarefas_contador_id_idx" ON "enderecos_tarefas"("contador_id");

-- CreateIndex
CREATE INDEX "imagens_tarefas_contador_id_idx" ON "imagens_tarefas"("contador_id");

-- CreateIndex
CREATE INDEX "notificacoes_contador_id_idx" ON "notificacoes"("contador_id");

-- CreateIndex
CREATE INDEX "tarefas_contador_id_idx" ON "tarefas"("contador_id");

-- CreateIndex
CREATE INDEX "tarefas_contador_id_status_idx" ON "tarefas"("contador_id", "status");

-- CreateIndex
CREATE INDEX "videos_tarefas_contador_id_idx" ON "videos_tarefas"("contador_id");

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_tarefas" ADD CONSTRAINT "enderecos_tarefas_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_tarefas" ADD CONSTRAINT "videos_tarefas_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
