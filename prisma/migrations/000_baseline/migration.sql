-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlanPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "NotificationSourceType" AS ENUM ('SYSTEM', 'TASK', 'ROUTE');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MASTER', 'ADMIN', 'EMPLOYER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BudgetGroupStatus" AS ENUM ('PENDING', 'ANSWERED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SimpleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_COMPLETED', 'BUDGET_APPROVED', 'BUDGET_PENDING_APPROVAL', 'BUDGET_REJECTED', 'SYSTEM_ALERT', 'PAYMENT_REMINDER', 'TASK_OVERDUE', 'NEW_MESSAGE', 'COLLECTION_LAUNCHED', 'LOW_STOCK_ALERT');

-- CreateEnum
CREATE TYPE "KanbanColumnStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "empresas" (
    "id" UUID NOT NULL,
    "status" "SimpleStatus" NOT NULL DEFAULT 'ACTIVE',
    "nome" VARCHAR(150) NOT NULL,
    "cnpj" VARCHAR(18) NOT NULL,
    "telefone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "endereco" VARCHAR(300) NOT NULL,
    "numero" VARCHAR(10) NOT NULL,
    "complemento" VARCHAR(100),
    "bairro" VARCHAR(100) NOT NULL,
    "cidade" VARCHAR(100) NOT NULL,
    "estado" VARCHAR(2) NOT NULL,
    "cep" VARCHAR(9) NOT NULL,
    "ramo_atividade" VARCHAR(100),
    "user_create_id" UUID,
    "data_de_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "status" "SimpleStatus" NOT NULL DEFAULT 'ACTIVE',
    "perfil" "UserRole" NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "documento" VARCHAR(20),
    "contato" VARCHAR(20) NOT NULL,
    "senha" VARCHAR(255) NOT NULL,
    "cargo_profissional" VARCHAR(100),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colunas_kanban" (
    "id" UUID NOT NULL,
    "status" "KanbanColumnStatus" NOT NULL DEFAULT 'ACTIVE',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "empresa_id" UUID,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colunas_kanban_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" UUID NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT,
    "comentario_final" TEXT,
    "agendado_para" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "prazo" TIMESTAMP(3),
    "data_conclusao" TIMESTAMP(3),
    "prioridade" INTEGER NOT NULL DEFAULT 1,
    "ordem_coluna" INTEGER NOT NULL DEFAULT 0,
    "user_assigned_id" UUID,
    "user_completed_id" UUID,
    "coluna_id" UUID NOT NULL,
    "rota_id" UUID,
    "empresa_id" UUID NOT NULL,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "budgetId" UUID,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enderecos_tarefas" (
    "id" UUID NOT NULL,
    "cep" VARCHAR(8) NOT NULL,
    "endereco" VARCHAR(200) NOT NULL,
    "numero" VARCHAR(10) NOT NULL,
    "bairro" VARCHAR(100) NOT NULL,
    "cidade" VARCHAR(100) NOT NULL,
    "estado" VARCHAR(2) NOT NULL,
    "complemento" VARCHAR(100),
    "tarefa_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "enderecos_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imagens_tarefas" (
    "id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "nome_arquivo" VARCHAR(200) NOT NULL,
    "tamanho" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tarefa_id" UUID NOT NULL,
    "user_upload_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "imagens_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audios_tarefas" (
    "id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "nome_arquivo" VARCHAR(200) NOT NULL,
    "duracao" INTEGER,
    "tamanho" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tarefa_id" UUID NOT NULL,
    "user_upload_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "audios_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos_tarefas" (
    "id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "nome_arquivo" VARCHAR(200) NOT NULL,
    "duracao" INTEGER,
    "tamanho" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "tarefa_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "user_upload_id" UUID NOT NULL,

    CONSTRAINT "videos_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotas" (
    "id" UUID NOT NULL,
    "status" "RouteStatus" NOT NULL DEFAULT 'SCHEDULED',
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT,
    "data_rota" TIMESTAMP(3),
    "user_assigned_id" UUID,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "rotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "message" TEXT,
    "companyId" UUID,
    "taskId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes_usuario" (
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lido_em" TIMESTAMP(3),
    "usuario_id" UUID NOT NULL,
    "notificacao_id" UUID NOT NULL,

    CONSTRAINT "notificacoes_usuario_pkey" PRIMARY KEY ("usuario_id","notificacao_id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "status" "SimpleStatus" NOT NULL DEFAULT 'ACTIVE',
    "name" VARCHAR(120) NOT NULL,
    "document" VARCHAR(18),
    "email" VARCHAR(120),
    "phone" VARCHAR(20),
    "address" VARCHAR(200),
    "city" VARCHAR(100),
    "state" VARCHAR(2),
    "zipCode" VARCHAR(10),
    "complement" VARCHAR(200),
    "empresa_id" UUID NOT NULL,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materiais" (
    "id" UUID NOT NULL,
    "status" "SimpleStatus" NOT NULL DEFAULT 'ACTIVE',
    "tipo" VARCHAR(50) NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "descricao" VARCHAR(200),
    "cor" VARCHAR(50),
    "unidade_medida" VARCHAR(20) NOT NULL,
    "rendimento_por_kg" INTEGER NOT NULL,
    "empresa_id" UUID NOT NULL,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materiais_fornecedores" (
    "id" UUID NOT NULL,
    "fornecedor_preferencial" BOOLEAN NOT NULL DEFAULT false,
    "valor_unitario_fornecedor" DECIMAL(10,4) NOT NULL,
    "valor_por_kg_fornecedor" DECIMAL(10,4) NOT NULL,
    "valor_por_metro_fornecedor" DECIMAL(10,4) NOT NULL,
    "codigo_fornecedor" VARCHAR(50) NOT NULL,
    "prazo_entrega_dias" INTEGER,
    "observacoes" VARCHAR(500),
    "fornecedor_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materiais_fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" UUID NOT NULL,
    "status" "SimpleStatus" NOT NULL DEFAULT 'ACTIVE',
    "referencia" VARCHAR(50),
    "nome" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "custo_unitario" DECIMAL(10,4) NOT NULL,
    "faixa_tamanhos" VARCHAR(50),
    "empresa_id" UUID NOT NULL,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos_materiais" (
    "quantidade" DECIMAL(10,4) NOT NULL,
    "produto_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_materiais_pkey" PRIMARY KEY ("produto_id","material_id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'PENDING',
    "titulo" VARCHAR(200) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "validade" TIMESTAMP(3),
    "forma_pagamento" VARCHAR(50),
    "atribuido_para_id" UUID NOT NULL,
    "respondido_em" TIMESTAMP(3),
    "grupo_orcamento_id" UUID,
    "empresa_id" UUID NOT NULL,
    "taskId" UUID,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos_produtos" (
    "id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custo_unitario_snapshot" DECIMAL(10,4) NOT NULL,
    "custo_total_snapshot" DECIMAL(12,4) NOT NULL,
    "orcamento_id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,

    CONSTRAINT "orcamentos_produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos_materiais" (
    "id" UUID NOT NULL,
    "quantidade_necessaria" DECIMAL(12,4) NOT NULL,
    "valor_unitario" DECIMAL(10,4) NOT NULL,
    "valor_total" DECIMAL(12,4) NOT NULL,
    "orcamento_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "material_fornecedor_id" UUID,

    CONSTRAINT "orcamentos_materiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos_orcamentos" (
    "id" UUID NOT NULL,
    "status" "BudgetGroupStatus" NOT NULL DEFAULT 'PENDING',
    "nome" VARCHAR(150),
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atribuido_para_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "orcamento_aprovado_id" UUID,

    CONSTRAINT "grupos_orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" UUID NOT NULL,
    "empresa_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_chat" (
    "id" UUID NOT NULL,
    "chat_id" UUID,
    "remetente_id" UUID NOT NULL,
    "profissional_mencionado_id" UUID,
    "mensagem" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluxos_produto" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fluxos_produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas_fluxo" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(50) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "cor" VARCHAR(7),
    "fluxo_id" UUID NOT NULL,
    "companyId" UUID,

    CONSTRAINT "etapas_fluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_fluxo" (
    "id" UUID NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "numero_pedido" VARCHAR(50) NOT NULL,
    "etapa_id" UUID,
    "ordem_etapa" INTEGER NOT NULL DEFAULT 0,
    "ref_produto" VARCHAR(50) NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "prioridade" INTEGER NOT NULL DEFAULT 3,
    "descricao" TEXT,
    "fluxo_id" UUID NOT NULL,
    "prazo" TIMESTAMP(3),
    "entrada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsavel_id" UUID,
    "empresa_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itens_fluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imagens_fluxo" (
    "id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "nome_arquivo" VARCHAR(200) NOT NULL,
    "tamanho" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "user_upload_id" UUID NOT NULL,

    CONSTRAINT "imagens_fluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audios_fluxo" (
    "id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "nome_arquivo" VARCHAR(200) NOT NULL,
    "duracao" INTEGER,
    "tamanho" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "user_upload_id" UUID NOT NULL,

    CONSTRAINT "audios_fluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos_fluxo" (
    "id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "nome_arquivo" VARCHAR(200) NOT NULL,
    "duracao" INTEGER,
    "tamanho" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "user_upload_id" UUID NOT NULL,

    CONSTRAINT "videos_fluxo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX "empresas_cnpj_idx" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX "empresas_status_idx" ON "empresas"("status");

-- CreateIndex
CREATE INDEX "empresas_data_de_criacao_idx" ON "empresas"("data_de_criacao");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_documento_key" ON "usuarios"("documento");

-- CreateIndex
CREATE INDEX "usuarios_empresa_id_idx" ON "usuarios"("empresa_id");

-- CreateIndex
CREATE INDEX "usuarios_email_idx" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_perfil_idx" ON "usuarios"("perfil");

-- CreateIndex
CREATE INDEX "usuarios_status_idx" ON "usuarios"("status");

-- CreateIndex
CREATE INDEX "usuarios_criado_em_idx" ON "usuarios"("criado_em");

-- CreateIndex
CREATE INDEX "colunas_kanban_empresa_id_idx" ON "colunas_kanban"("empresa_id");

-- CreateIndex
CREATE INDEX "colunas_kanban_ordem_idx" ON "colunas_kanban"("ordem");

-- CreateIndex
CREATE UNIQUE INDEX "colunas_kanban_empresa_id_titulo_key" ON "colunas_kanban"("empresa_id", "titulo");

-- CreateIndex
CREATE INDEX "tarefas_empresa_id_idx" ON "tarefas"("empresa_id");

-- CreateIndex
CREATE INDEX "tarefas_user_assigned_id_idx" ON "tarefas"("user_assigned_id");

-- CreateIndex
CREATE INDEX "tarefas_status_idx" ON "tarefas"("status");

-- CreateIndex
CREATE INDEX "tarefas_prazo_idx" ON "tarefas"("prazo");

-- CreateIndex
CREATE INDEX "tarefas_prioridade_idx" ON "tarefas"("prioridade");

-- CreateIndex
CREATE INDEX "tarefas_criado_em_idx" ON "tarefas"("criado_em");

-- CreateIndex
CREATE INDEX "tarefas_empresa_id_status_idx" ON "tarefas"("empresa_id", "status");

-- CreateIndex
CREATE INDEX "tarefas_prazo_status_idx" ON "tarefas"("prazo", "status");

-- CreateIndex
CREATE INDEX "tarefas_user_assigned_id_status_idx" ON "tarefas"("user_assigned_id", "status");

-- CreateIndex
CREATE INDEX "tarefas_rota_id_idx" ON "tarefas"("rota_id");

-- CreateIndex
CREATE UNIQUE INDEX "enderecos_tarefas_tarefa_id_key" ON "enderecos_tarefas"("tarefa_id");

-- CreateIndex
CREATE INDEX "enderecos_tarefas_tarefa_id_idx" ON "enderecos_tarefas"("tarefa_id");

-- CreateIndex
CREATE INDEX "imagens_tarefas_tarefa_id_idx" ON "imagens_tarefas"("tarefa_id");

-- CreateIndex
CREATE INDEX "audios_tarefas_tarefa_id_idx" ON "audios_tarefas"("tarefa_id");

-- CreateIndex
CREATE INDEX "videos_tarefas_empresa_id_idx" ON "videos_tarefas"("empresa_id");

-- CreateIndex
CREATE INDEX "videos_tarefas_tarefa_id_idx" ON "videos_tarefas"("tarefa_id");

-- CreateIndex
CREATE INDEX "rotas_empresa_id_idx" ON "rotas"("empresa_id");

-- CreateIndex
CREATE INDEX "rotas_empresa_id_status_idx" ON "rotas"("empresa_id", "status");

-- CreateIndex
CREATE INDEX "rotas_empresa_id_data_rota_idx" ON "rotas"("empresa_id", "data_rota");

-- CreateIndex
CREATE INDEX "rotas_user_assigned_id_status_idx" ON "rotas"("user_assigned_id", "status");

-- CreateIndex
CREATE INDEX "notificacoes_usuario_notificacao_id_idx" ON "notificacoes_usuario"("notificacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_document_key" ON "suppliers"("document");

-- CreateIndex
CREATE INDEX "materiais_empresa_id_idx" ON "materiais"("empresa_id");

-- CreateIndex
CREATE INDEX "materiais_tipo_idx" ON "materiais"("tipo");

-- CreateIndex
CREATE INDEX "materiais_descricao_idx" ON "materiais"("descricao");

-- CreateIndex
CREATE INDEX "materiais_fornecedores_fornecedor_id_idx" ON "materiais_fornecedores"("fornecedor_id");

-- CreateIndex
CREATE INDEX "materiais_fornecedores_material_id_idx" ON "materiais_fornecedores"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "materiais_fornecedores_fornecedor_id_material_id_key" ON "materiais_fornecedores"("fornecedor_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_referencia_key" ON "produtos"("referencia");

-- CreateIndex
CREATE INDEX "produtos_empresa_id_idx" ON "produtos"("empresa_id");

-- CreateIndex
CREATE INDEX "produtos_referencia_idx" ON "produtos"("referencia");

-- CreateIndex
CREATE INDEX "produtos_materiais_produto_id_idx" ON "produtos_materiais"("produto_id");

-- CreateIndex
CREATE INDEX "produtos_materiais_material_id_idx" ON "produtos_materiais"("material_id");

-- CreateIndex
CREATE INDEX "orcamentos_empresa_id_idx" ON "orcamentos"("empresa_id");

-- CreateIndex
CREATE INDEX "orcamentos_user_create_id_idx" ON "orcamentos"("user_create_id");

-- CreateIndex
CREATE INDEX "orcamentos_atribuido_para_id_idx" ON "orcamentos"("atribuido_para_id");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_criado_em_idx" ON "orcamentos"("criado_em");

-- CreateIndex
CREATE INDEX "orcamentos_validade_idx" ON "orcamentos"("validade");

-- CreateIndex
CREATE INDEX "orcamentos_produtos_orcamento_id_idx" ON "orcamentos_produtos"("orcamento_id");

-- CreateIndex
CREATE INDEX "orcamentos_produtos_produto_id_idx" ON "orcamentos_produtos"("produto_id");

-- CreateIndex
CREATE INDEX "orcamentos_materiais_orcamento_id_idx" ON "orcamentos_materiais"("orcamento_id");

-- CreateIndex
CREATE INDEX "orcamentos_materiais_material_id_idx" ON "orcamentos_materiais"("material_id");

-- CreateIndex
CREATE INDEX "orcamentos_materiais_material_fornecedor_id_idx" ON "orcamentos_materiais"("material_fornecedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_orcamentos_orcamento_aprovado_id_key" ON "grupos_orcamentos"("orcamento_aprovado_id");

-- CreateIndex
CREATE INDEX "grupos_orcamentos_empresa_id_idx" ON "grupos_orcamentos"("empresa_id");

-- CreateIndex
CREATE INDEX "grupos_orcamentos_user_create_id_idx" ON "grupos_orcamentos"("user_create_id");

-- CreateIndex
CREATE INDEX "grupos_orcamentos_atribuido_para_id_idx" ON "grupos_orcamentos"("atribuido_para_id");

-- CreateIndex
CREATE INDEX "chats_empresa_id_idx" ON "chats"("empresa_id");

-- CreateIndex
CREATE INDEX "mensagens_chat_chat_id_idx" ON "mensagens_chat"("chat_id");

-- CreateIndex
CREATE INDEX "mensagens_chat_remetente_id_idx" ON "mensagens_chat"("remetente_id");

-- CreateIndex
CREATE INDEX "mensagens_chat_profissional_mencionado_id_idx" ON "mensagens_chat"("profissional_mencionado_id");

-- CreateIndex
CREATE INDEX "mensagens_chat_criado_em_idx" ON "mensagens_chat"("criado_em");

-- CreateIndex
CREATE INDEX "fluxos_produto_empresa_id_idx" ON "fluxos_produto"("empresa_id");

-- CreateIndex
CREATE INDEX "etapas_fluxo_fluxo_id_idx" ON "etapas_fluxo"("fluxo_id");

-- CreateIndex
CREATE UNIQUE INDEX "etapas_fluxo_fluxo_id_ordem_key" ON "etapas_fluxo"("fluxo_id", "ordem");

-- CreateIndex
CREATE INDEX "itens_fluxo_empresa_id_idx" ON "itens_fluxo"("empresa_id");

-- CreateIndex
CREATE INDEX "itens_fluxo_fluxo_id_idx" ON "itens_fluxo"("fluxo_id");

-- CreateIndex
CREATE INDEX "itens_fluxo_etapa_id_idx" ON "itens_fluxo"("etapa_id");

-- CreateIndex
CREATE INDEX "itens_fluxo_responsavel_id_idx" ON "itens_fluxo"("responsavel_id");

-- CreateIndex
CREATE INDEX "itens_fluxo_prioridade_idx" ON "itens_fluxo"("prioridade");

-- CreateIndex
CREATE INDEX "itens_fluxo_prazo_idx" ON "itens_fluxo"("prazo");

-- CreateIndex
CREATE INDEX "imagens_fluxo_empresa_id_idx" ON "imagens_fluxo"("empresa_id");

-- CreateIndex
CREATE INDEX "imagens_fluxo_item_id_idx" ON "imagens_fluxo"("item_id");

-- CreateIndex
CREATE INDEX "audios_fluxo_empresa_id_idx" ON "audios_fluxo"("empresa_id");

-- CreateIndex
CREATE INDEX "audios_fluxo_item_id_idx" ON "audios_fluxo"("item_id");

-- CreateIndex
CREATE INDEX "videos_fluxo_empresa_id_idx" ON "videos_fluxo"("empresa_id");

-- CreateIndex
CREATE INDEX "videos_fluxo_item_id_idx" ON "videos_fluxo"("item_id");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_assigned_id_fkey" FOREIGN KEY ("user_assigned_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_completed_id_fkey" FOREIGN KEY ("user_completed_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_coluna_id_fkey" FOREIGN KEY ("coluna_id") REFERENCES "colunas_kanban"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_rota_id_fkey" FOREIGN KEY ("rota_id") REFERENCES "rotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_tarefas" ADD CONSTRAINT "enderecos_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_tarefas" ADD CONSTRAINT "enderecos_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_user_upload_id_fkey" FOREIGN KEY ("user_upload_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_user_upload_id_fkey" FOREIGN KEY ("user_upload_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_tarefas" ADD CONSTRAINT "videos_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_tarefas" ADD CONSTRAINT "videos_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_tarefas" ADD CONSTRAINT "videos_tarefas_user_upload_id_fkey" FOREIGN KEY ("user_upload_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_user_assigned_id_fkey" FOREIGN KEY ("user_assigned_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotas" ADD CONSTRAINT "rotas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tarefas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes_usuario" ADD CONSTRAINT "notificacoes_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes_usuario" ADD CONSTRAINT "notificacoes_usuario_notificacao_id_fkey" FOREIGN KEY ("notificacao_id") REFERENCES "notificacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_fornecedores" ADD CONSTRAINT "materiais_fornecedores_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_fornecedores" ADD CONSTRAINT "materiais_fornecedores_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materiais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_fornecedores" ADD CONSTRAINT "materiais_fornecedores_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_fornecedores" ADD CONSTRAINT "materiais_fornecedores_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_materiais" ADD CONSTRAINT "produtos_materiais_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_materiais" ADD CONSTRAINT "produtos_materiais_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materiais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_materiais" ADD CONSTRAINT "produtos_materiais_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_materiais" ADD CONSTRAINT "produtos_materiais_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_atribuido_para_id_fkey" FOREIGN KEY ("atribuido_para_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_grupo_orcamento_id_fkey" FOREIGN KEY ("grupo_orcamento_id") REFERENCES "grupos_orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tarefas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos_produtos" ADD CONSTRAINT "orcamentos_produtos_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos_produtos" ADD CONSTRAINT "orcamentos_produtos_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos_materiais" ADD CONSTRAINT "orcamentos_materiais_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos_materiais" ADD CONSTRAINT "orcamentos_materiais_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materiais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos_materiais" ADD CONSTRAINT "orcamentos_materiais_material_fornecedor_id_fkey" FOREIGN KEY ("material_fornecedor_id") REFERENCES "materiais_fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_orcamentos" ADD CONSTRAINT "grupos_orcamentos_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_orcamentos" ADD CONSTRAINT "grupos_orcamentos_atribuido_para_id_fkey" FOREIGN KEY ("atribuido_para_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_orcamentos" ADD CONSTRAINT "grupos_orcamentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos_orcamentos" ADD CONSTRAINT "grupos_orcamentos_orcamento_aprovado_id_fkey" FOREIGN KEY ("orcamento_aprovado_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_remetente_id_fkey" FOREIGN KEY ("remetente_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_profissional_mencionado_id_fkey" FOREIGN KEY ("profissional_mencionado_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxos_produto" ADD CONSTRAINT "fluxos_produto_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_fluxo" ADD CONSTRAINT "etapas_fluxo_fluxo_id_fkey" FOREIGN KEY ("fluxo_id") REFERENCES "fluxos_produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_fluxo" ADD CONSTRAINT "etapas_fluxo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_fluxo" ADD CONSTRAINT "itens_fluxo_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapas_fluxo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_fluxo" ADD CONSTRAINT "itens_fluxo_fluxo_id_fkey" FOREIGN KEY ("fluxo_id") REFERENCES "fluxos_produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_fluxo" ADD CONSTRAINT "itens_fluxo_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_fluxo" ADD CONSTRAINT "itens_fluxo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_fluxo" ADD CONSTRAINT "imagens_fluxo_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens_fluxo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_fluxo" ADD CONSTRAINT "imagens_fluxo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_fluxo" ADD CONSTRAINT "imagens_fluxo_user_upload_id_fkey" FOREIGN KEY ("user_upload_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_fluxo" ADD CONSTRAINT "audios_fluxo_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens_fluxo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_fluxo" ADD CONSTRAINT "audios_fluxo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_fluxo" ADD CONSTRAINT "audios_fluxo_user_upload_id_fkey" FOREIGN KEY ("user_upload_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_fluxo" ADD CONSTRAINT "videos_fluxo_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "itens_fluxo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_fluxo" ADD CONSTRAINT "videos_fluxo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_fluxo" ADD CONSTRAINT "videos_fluxo_user_upload_id_fkey" FOREIGN KEY ("user_upload_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

