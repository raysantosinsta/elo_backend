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
CREATE TYPE "BudgetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_COMPLETED', 'BUDGET_APPROVED', 'BUDGET_PENDING_APPROVAL', 'BUDGET_REJECTED', 'SYSTEM_ALERT', 'PAYMENT_REMINDER', 'TASK_OVERDUE', 'NEW_MESSAGE', 'COLLECTION_LAUNCHED', 'LOW_STOCK_ALERT');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "KanbanColumnStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "empresas" (
    "id" UUID NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ATIVO',
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
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "nome" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "documento" VARCHAR(20),
    "senha" VARCHAR(255) NOT NULL,
    "perfil" "UserRole" NOT NULL,
    "profissional" BOOLEAN NOT NULL DEFAULT false,
    "cargo_profissional" VARCHAR(100),
    "telefone" VARCHAR(20) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colunas_kanban" (
    "id" UUID NOT NULL,
    "status" "KanbanColumnStatus" NOT NULL DEFAULT 'ACTIVE',
    "descricao" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID,
    "criado_por_id" UUID,
    "atualizado_por_id" UUID,
    "owner_id" UUID,

    CONSTRAINT "colunas_kanban_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" UUID NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT,
    "prazo" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "prioridade" INTEGER NOT NULL DEFAULT 1,
    "agendado_para" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em" TIMESTAMP(3),
    "falhou_em" TIMESTAMP(3),
    "comentario_final" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "ordem_coluna" INTEGER NOT NULL DEFAULT 0,
    "user_assigned_id" UUID,
    "user_completed_id" UUID,
    "user_create_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_update_id" UUID,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "coluna_id" UUID NOT NULL,
    "rota_id" UUID,

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
    "companyId" UUID,

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
    "empresa_id" UUID NOT NULL,
    "user_upload_id" UUID NOT NULL,

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
    "empresa_id" UUID NOT NULL,
    "user_upload_id" UUID NOT NULL,

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
    "titulo" VARCHAR(200) NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tipo" "NotificationType" NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lido_em" TIMESTAMP(3),
    "origem_tipo" "NotificationSourceType",
    "origem_id" UUID,
    "empresa_id" UUID NOT NULL,
    "tarefa_id" UUID,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes_usuario" (
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" UUID NOT NULL,
    "notificacao_id" UUID NOT NULL,

    CONSTRAINT "notificacoes_usuario_pkey" PRIMARY KEY ("usuario_id","notificacao_id")
);

-- CreateTable
CREATE TABLE "materiais" (
    "id" UUID NOT NULL,
    "descricao" VARCHAR(200) NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "mes" VARCHAR(10),
    "fornecedor" VARCHAR(100),
    "valor_unitario" DECIMAL(10,4),
    "unidade_medida" VARCHAR(20),
    "quantidade_por_unidade" DOUBLE PRECISION,
    "valor_por_kg" DECIMAL(10,4),
    "valor_por_metro" DECIMAL(10,4),
    "cor" VARCHAR(50),
    "unidade_tecido" VARCHAR(20),
    "rendimento" VARCHAR(50),
    "peso_mt" VARCHAR(50),
    "sku" VARCHAR(50),
    "estoque_minimo" DECIMAL(10,2) DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "materiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" UUID NOT NULL,
    "referencia" VARCHAR(50) NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "custo_base" DECIMAL(10,2) NOT NULL,
    "preco_venda" DECIMAL(10,2) NOT NULL,
    "faixa_tamanhos" VARCHAR(50),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos_materiais" (
    "produto_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "quantidade" DECIMAL(10,4) NOT NULL,
    "tipo_quantidade" VARCHAR(20) NOT NULL,
    "valor_unitario" DECIMAL(10,4) NOT NULL,
    "custo_unitario" DECIMAL(10,4) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_materiais_pkey" PRIMARY KEY ("produto_id","material_id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" UUID NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "nome_cliente" VARCHAR(150),
    "email_cliente" VARCHAR(255),
    "telefone_cliente" VARCHAR(20),
    "total" DECIMAL(12,2) NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'PENDING',
    "itens" JSONB,
    "validade" TIMESTAMP(3),
    "observacoes" TEXT,
    "servico" VARCHAR(200),
    "valor_unitario" DECIMAL(12,2),
    "forma_pagamento" VARCHAR(50),
    "previsao_entrega" TIMESTAMP(3),
    "quantidade" INTEGER,
    "aprovado_em" TIMESTAMP(3),
    "rejeitado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "criado_por_id" UUID NOT NULL,
    "atribuido_para_id" UUID,
    "tarefa_id" UUID,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colecoes" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "referencia" VARCHAR(50) NOT NULL,
    "modelo" VARCHAR(150) NOT NULL,
    "quantidade_cortada" INTEGER NOT NULL,
    "custo_total" DECIMAL(10,2) NOT NULL,
    "lancamento" BOOLEAN NOT NULL DEFAULT false,
    "cor" VARCHAR(100) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "produto_id" UUID,

    CONSTRAINT "colecoes_pkey" PRIMARY KEY ("id")
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
    "mensagem" TEXT NOT NULL,
    "profissional_mencionado_id" UUID,
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
CREATE INDEX "imagens_tarefas_empresa_id_idx" ON "imagens_tarefas"("empresa_id");

-- CreateIndex
CREATE INDEX "imagens_tarefas_tarefa_id_idx" ON "imagens_tarefas"("tarefa_id");

-- CreateIndex
CREATE INDEX "audios_tarefas_empresa_id_idx" ON "audios_tarefas"("empresa_id");

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
CREATE INDEX "notificacoes_empresa_id_idx" ON "notificacoes"("empresa_id");

-- CreateIndex
CREATE INDEX "notificacoes_tipo_idx" ON "notificacoes"("tipo");

-- CreateIndex
CREATE INDEX "notificacoes_criado_em_idx" ON "notificacoes"("criado_em");

-- CreateIndex
CREATE INDEX "notificacoes_lida_idx" ON "notificacoes"("lida");

-- CreateIndex
CREATE INDEX "notificacoes_usuario_criado_em_idx" ON "notificacoes_usuario"("criado_em");

-- CreateIndex
CREATE INDEX "materiais_empresa_id_idx" ON "materiais"("empresa_id");

-- CreateIndex
CREATE INDEX "materiais_tipo_idx" ON "materiais"("tipo");

-- CreateIndex
CREATE INDEX "materiais_fornecedor_idx" ON "materiais"("fornecedor");

-- CreateIndex
CREATE INDEX "materiais_mes_idx" ON "materiais"("mes");

-- CreateIndex
CREATE INDEX "materiais_descricao_idx" ON "materiais"("descricao");

-- CreateIndex
CREATE INDEX "materiais_sku_idx" ON "materiais"("sku");

-- CreateIndex
CREATE INDEX "materiais_ativo_idx" ON "materiais"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_referencia_key" ON "produtos"("referencia");

-- CreateIndex
CREATE INDEX "produtos_empresa_id_idx" ON "produtos"("empresa_id");

-- CreateIndex
CREATE INDEX "produtos_referencia_idx" ON "produtos"("referencia");

-- CreateIndex
CREATE INDEX "produtos_ativo_idx" ON "produtos"("ativo");

-- CreateIndex
CREATE INDEX "produtos_materiais_produto_id_idx" ON "produtos_materiais"("produto_id");

-- CreateIndex
CREATE INDEX "produtos_materiais_material_id_idx" ON "produtos_materiais"("material_id");

-- CreateIndex
CREATE INDEX "produtos_materiais_tipo_quantidade_idx" ON "produtos_materiais"("tipo_quantidade");

-- CreateIndex
CREATE INDEX "orcamentos_empresa_id_idx" ON "orcamentos"("empresa_id");

-- CreateIndex
CREATE INDEX "orcamentos_criado_por_id_idx" ON "orcamentos"("criado_por_id");

-- CreateIndex
CREATE INDEX "orcamentos_atribuido_para_id_idx" ON "orcamentos"("atribuido_para_id");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_nome_cliente_idx" ON "orcamentos"("nome_cliente");

-- CreateIndex
CREATE INDEX "orcamentos_tarefa_id_idx" ON "orcamentos"("tarefa_id");

-- CreateIndex
CREATE INDEX "orcamentos_criado_em_idx" ON "orcamentos"("criado_em");

-- CreateIndex
CREATE INDEX "orcamentos_validade_idx" ON "orcamentos"("validade");

-- CreateIndex
CREATE UNIQUE INDEX "colecoes_referencia_key" ON "colecoes"("referencia");

-- CreateIndex
CREATE INDEX "colecoes_empresa_id_idx" ON "colecoes"("empresa_id");

-- CreateIndex
CREATE INDEX "colecoes_nome_idx" ON "colecoes"("nome");

-- CreateIndex
CREATE INDEX "colecoes_referencia_idx" ON "colecoes"("referencia");

-- CreateIndex
CREATE INDEX "colecoes_lancamento_idx" ON "colecoes"("lancamento");

-- CreateIndex
CREATE INDEX "colecoes_criado_em_idx" ON "colecoes"("criado_em");

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
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_assigned_id_fkey" FOREIGN KEY ("user_assigned_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_completed_id_fkey" FOREIGN KEY ("user_completed_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_create_id_fkey" FOREIGN KEY ("user_create_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_user_update_id_fkey" FOREIGN KEY ("user_update_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_coluna_id_fkey" FOREIGN KEY ("coluna_id") REFERENCES "colunas_kanban"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_rota_id_fkey" FOREIGN KEY ("rota_id") REFERENCES "rotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_tarefas" ADD CONSTRAINT "enderecos_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_tarefas" ADD CONSTRAINT "enderecos_tarefas_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_user_upload_id_fkey" FOREIGN KEY ("user_upload_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_user_upload_id_fkey" FOREIGN KEY ("user_upload_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes_usuario" ADD CONSTRAINT "notificacoes_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes_usuario" ADD CONSTRAINT "notificacoes_usuario_notificacao_id_fkey" FOREIGN KEY ("notificacao_id") REFERENCES "notificacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_materiais" ADD CONSTRAINT "produtos_materiais_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_materiais" ADD CONSTRAINT "produtos_materiais_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materiais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_atribuido_para_id_fkey" FOREIGN KEY ("atribuido_para_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecoes" ADD CONSTRAINT "colecoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecoes" ADD CONSTRAINT "colecoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_remetente_id_fkey" FOREIGN KEY ("remetente_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_profissional_mencionado_id_fkey" FOREIGN KEY ("profissional_mencionado_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxos_produto" ADD CONSTRAINT "fluxos_produto_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_fluxo" ADD CONSTRAINT "etapas_fluxo_fluxo_id_fkey" FOREIGN KEY ("fluxo_id") REFERENCES "fluxos_produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

