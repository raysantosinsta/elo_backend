-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MASTER', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlanPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_COMPLETED', 'BUDGET_APPROVED', 'BUDGET_PENDING_APPROVAL', 'BUDGET_REJECTED', 'SYSTEM_ALERT', 'PAYMENT_REMINDER', 'TASK_OVERDUE', 'NEW_MESSAGE', 'COLLECTION_LAUNCHED', 'LOW_STOCK_ALERT');

-- CreateEnum
CREATE TYPE "QuantidadeTipo" AS ENUM ('QTDE', 'MEDIA');

-- CreateTable
CREATE TABLE "empresas" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "cnpj" VARCHAR(18) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ativo',
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
    "data_de_criacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,
    "periodo" "PlanPeriod" NOT NULL,
    "periodo_teste" INTEGER,
    "limite_usuarios" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "recursos" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "senha" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "perfil" "UserRole" NOT NULL,
    "profissional" BOOLEAN NOT NULL DEFAULT false,
    "cargo_profissional" VARCHAR(100),
    "contato" VARCHAR(20) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "data_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_renovacao" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3),
    "forma_pagamento" VARCHAR(50),
    "fim_teste" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "plano_id" UUID NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colunas_kanban" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,
    "criado_por_id" UUID NOT NULL,

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
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "criado_por_id" UUID,
    "concluido_por_id" UUID,
    "empresa_id" UUID NOT NULL,
    "coluna_id" UUID NOT NULL,
    "atribuido_para_id" UUID,
    "rota_id" UUID,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enderecos_tarefas" (
    "id" UUID NOT NULL,
    "rua" VARCHAR(200) NOT NULL,
    "numero" VARCHAR(10) NOT NULL,
    "complemento" VARCHAR(100),
    "bairro" VARCHAR(100) NOT NULL,
    "cidade" VARCHAR(100) NOT NULL,
    "estado" VARCHAR(2) NOT NULL,
    "cep" VARCHAR(9) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
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
    "tarefa_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "videos_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotas" (
    "id" UUID NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

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
    "empresa_id" UUID NOT NULL,
    "tarefa_id" UUID,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes_usuario" (
    "usuario_id" UUID NOT NULL,
    "notificacao_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_email_em" TIMESTAMP(3),

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
    "tipo_quantidade" "QuantidadeTipo" NOT NULL,
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
CREATE TABLE "configuracoes_empresa" (
    "id" UUID NOT NULL,
    "chave" VARCHAR(100) NOT NULL,
    "valor" JSONB,
    "descricao" VARCHAR(300),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "configuracoes_empresa_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX "empresas_cnpj_idx" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX "empresas_status_idx" ON "empresas"("status");

-- CreateIndex
CREATE INDEX "empresas_data_de_criacao_idx" ON "empresas"("data_de_criacao");

-- CreateIndex
CREATE INDEX "planos_ativo_idx" ON "planos"("ativo");

-- CreateIndex
CREATE INDEX "planos_preco_idx" ON "planos"("preco");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

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
CREATE UNIQUE INDEX "assinaturas_empresa_id_key" ON "assinaturas"("empresa_id");

-- CreateIndex
CREATE INDEX "assinaturas_status_idx" ON "assinaturas"("status");

-- CreateIndex
CREATE INDEX "assinaturas_data_renovacao_idx" ON "assinaturas"("data_renovacao");

-- CreateIndex
CREATE INDEX "assinaturas_fim_teste_idx" ON "assinaturas"("fim_teste");

-- CreateIndex
CREATE INDEX "colunas_kanban_empresa_id_idx" ON "colunas_kanban"("empresa_id");

-- CreateIndex
CREATE INDEX "colunas_kanban_ordem_idx" ON "colunas_kanban"("ordem");

-- CreateIndex
CREATE INDEX "colunas_kanban_ativo_idx" ON "colunas_kanban"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "colunas_kanban_empresa_id_titulo_key" ON "colunas_kanban"("empresa_id", "titulo");

-- CreateIndex
CREATE INDEX "tarefas_empresa_id_idx" ON "tarefas"("empresa_id");

-- CreateIndex
CREATE INDEX "tarefas_atribuido_para_id_idx" ON "tarefas"("atribuido_para_id");

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
CREATE INDEX "tarefas_atribuido_para_id_status_idx" ON "tarefas"("atribuido_para_id", "status");

-- CreateIndex
CREATE INDEX "tarefas_rota_id_idx" ON "tarefas"("rota_id");

-- CreateIndex
CREATE UNIQUE INDEX "enderecos_tarefas_tarefa_id_key" ON "enderecos_tarefas"("tarefa_id");

-- CreateIndex
CREATE INDEX "enderecos_tarefas_empresa_id_idx" ON "enderecos_tarefas"("empresa_id");

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
CREATE INDEX "configuracoes_empresa_empresa_id_idx" ON "configuracoes_empresa"("empresa_id");

-- CreateIndex
CREATE INDEX "configuracoes_empresa_ativo_idx" ON "configuracoes_empresa"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_empresa_empresa_id_chave_key" ON "configuracoes_empresa"("empresa_id", "chave");

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

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas_kanban" ADD CONSTRAINT "colunas_kanban_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_concluido_por_id_fkey" FOREIGN KEY ("concluido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_coluna_id_fkey" FOREIGN KEY ("coluna_id") REFERENCES "colunas_kanban"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_atribuido_para_id_fkey" FOREIGN KEY ("atribuido_para_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_rota_id_fkey" FOREIGN KEY ("rota_id") REFERENCES "rotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_tarefas" ADD CONSTRAINT "enderecos_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_tarefas" ADD CONSTRAINT "enderecos_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imagens_tarefas" ADD CONSTRAINT "imagens_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audios_tarefas" ADD CONSTRAINT "audios_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_tarefas" ADD CONSTRAINT "videos_tarefas_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos_tarefas" ADD CONSTRAINT "videos_tarefas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "configuracoes_empresa" ADD CONSTRAINT "configuracoes_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecoes" ADD CONSTRAINT "colecoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecoes" ADD CONSTRAINT "colecoes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
