/*
  Warnings:

  - The values [USER] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - The values [ACTIVE,INACTIVE,BLOCKED] on the enum `UserStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `ativo` on the `colunas_kanban` table. All the data in the column will be lost.
  - The `status` column on the `empresas` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `contato` on the `usuarios` table. All the data in the column will be lost.
  - You are about to drop the column `empresa_id` on the `usuarios` table. All the data in the column will be lost.
  - You are about to drop the `configuracoes_empresa` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[documento]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `descricao` to the `colunas_kanban` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `tipo_quantidade` on the `produtos_materiais` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `telefone` to the `usuarios` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "KanbanColumnStatus" AS ENUM ('PENDING', 'FINISHED');

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('MASTER', 'ADMIN', 'EMPLOYER');
ALTER TABLE "usuarios" ALTER COLUMN "perfil" TYPE "UserRole_new" USING ("perfil"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserStatus_new" AS ENUM ('ATIVO', 'INATIVO');
ALTER TABLE "public"."usuarios" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "usuarios" ALTER COLUMN "status" TYPE "UserStatus_new" USING ("status"::text::"UserStatus_new");
ALTER TYPE "UserStatus" RENAME TO "UserStatus_old";
ALTER TYPE "UserStatus_new" RENAME TO "UserStatus";
DROP TYPE "public"."UserStatus_old";
ALTER TABLE "usuarios" ALTER COLUMN "status" SET DEFAULT 'ATIVO';
COMMIT;

-- DropForeignKey
ALTER TABLE "colunas_kanban" DROP CONSTRAINT "colunas_kanban_criado_por_id_fkey";

-- DropForeignKey
ALTER TABLE "configuracoes_empresa" DROP CONSTRAINT "configuracoes_empresa_empresa_id_fkey";

-- DropForeignKey
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_empresa_id_fkey";

-- DropIndex
DROP INDEX "colunas_kanban_ativo_idx";

-- DropIndex
DROP INDEX "usuarios_empresa_id_idx";

-- AlterTable
ALTER TABLE "colunas_kanban" DROP COLUMN "ativo",
ADD COLUMN     "atualizado_por_id" UUID,
ADD COLUMN     "descricao" TEXT NOT NULL,
ADD COLUMN     "status" "KanbanColumnStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "ordem" SET DEFAULT 1,
ALTER COLUMN "empresa_id" DROP NOT NULL,
ALTER COLUMN "criado_por_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "empresas" DROP COLUMN "status",
ADD COLUMN     "status" "CompanyStatus" NOT NULL DEFAULT 'ATIVO';

-- AlterTable
ALTER TABLE "produtos_materiais" DROP COLUMN "tipo_quantidade",
ADD COLUMN     "tipo_quantidade" VARCHAR(20) NOT NULL;

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "contato",
DROP COLUMN "empresa_id",
ADD COLUMN     "contador_id" UUID,
ADD COLUMN     "documento" VARCHAR(20),
ADD COLUMN     "telefone" VARCHAR(20) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'ATIVO';

-- DropTable
DROP TABLE "configuracoes_empresa";

-- DropEnum
DROP TYPE "QuantidadeTipo";

-- CreateIndex
CREATE INDEX "empresas_status_idx" ON "empresas"("status");

-- CreateIndex
CREATE INDEX "produtos_materiais_tipo_quantidade_idx" ON "produtos_materiais"("tipo_quantidade");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_documento_key" ON "usuarios"("documento");

-- CreateIndex
CREATE INDEX "usuarios_contador_id_idx" ON "usuarios"("contador_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_contador_id_fkey" FOREIGN KEY ("contador_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
