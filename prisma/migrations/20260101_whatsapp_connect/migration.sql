-- supabase/migrations/xxxx_add_whatsapp_connections.sql

-- ============================================================================
-- 1. CRIAR TABELA whatsapp_connections
-- ============================================================================
CREATE TABLE IF NOT EXISTS "whatsapp_connections" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL REFERENCES "empresas"("id") ON DELETE CASCADE,
    "whatsapp_id" INTEGER,
    "name" VARCHAR(100) NOT NULL,
    "token" TEXT NOT NULL,
    "provider" VARCHAR(50) DEFAULT 'beta',
    "phone_number" VARCHAR(20),
    "meta_phone_number_id" VARCHAR(100),
    "meta_waba_id" VARCHAR(100),
    "meta_business_id" VARCHAR(100),
    "is_default" BOOLEAN DEFAULT false,
    "greeting_message" TEXT,
    "out_of_hours_message" TEXT,
    "complation_message" TEXT,
    "rating_message" TEXT,
    "expires_inactive_message" TEXT,
    "expires_ticket" INTEGER DEFAULT 0,
    "max_use_bot_queues" INTEGER DEFAULT 3,
    "time_use_bot_queues" INTEGER DEFAULT 0,
    "bot_flow_id" INTEGER,
    "prompt_id" INTEGER,
    "transfer_queue_id" INTEGER,
    "queue_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "qr_code" TEXT,
    "qr_code_updated_at" TIMESTAMPTZ,
    "status" VARCHAR(20) DEFAULT 'disconnected',
    "last_verified" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. CRIAR ÍNDICES
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_connections_company_id_key" ON "whatsapp_connections"("company_id");
CREATE INDEX IF NOT EXISTS "whatsapp_connections_company_id_idx" ON "whatsapp_connections"("company_id");
CREATE INDEX IF NOT EXISTS "whatsapp_connections_status_idx" ON "whatsapp_connections"("status");
CREATE INDEX IF NOT EXISTS "whatsapp_connections_whatsapp_id_idx" ON "whatsapp_connections"("whatsapp_id");
CREATE INDEX IF NOT EXISTS "whatsapp_connections_created_at_idx" ON "whatsapp_connections"("created_at");

-- ============================================================================
-- 3. HABILITAR ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. CRIAR POLÍTICAS DE SEGURANÇA (RLS)
-- ============================================================================

-- Política 1: SELECT - Usuários podem ver apenas conexões da sua própria empresa
CREATE POLICY "Users can view own company whatsapp connection" 
ON "whatsapp_connections"
FOR SELECT 
USING (
    -- Verifica se o usuário pertence à empresa
    company_id IN (
        SELECT "empresa_id" 
        FROM "usuarios" 
        WHERE "id" = auth.uid()
    )
);

-- Política 2: INSERT - Apenas usuários autenticados podem inserir
CREATE POLICY "Users can insert whatsapp connection for own company" 
ON "whatsapp_connections"
FOR INSERT 
WITH CHECK (
    -- Usuário autenticado e a empresa pertence ao usuário
    auth.role() = 'authenticated' AND
    company_id IN (
        SELECT "empresa_id" 
        FROM "usuarios" 
        WHERE "id" = auth.uid()
    )
);

-- Política 3: UPDATE - Usuários podem atualizar apenas conexões da sua empresa
CREATE POLICY "Users can update own company whatsapp connection" 
ON "whatsapp_connections"
FOR UPDATE 
USING (
    company_id IN (
        SELECT "empresa_id" 
        FROM "usuarios" 
        WHERE "id" = auth.uid()
    )
);

-- Política 4: DELETE - Usuários podem deletar apenas conexões da sua empresa
CREATE POLICY "Users can delete own company whatsapp connection" 
ON "whatsapp_connections"
FOR DELETE 
USING (
    company_id IN (
        SELECT "empresa_id" 
        FROM "usuarios" 
        WHERE "id" = auth.uid()
    )
);

-- ============================================================================
-- 5. CRIAR TRIGGER PARA ATUALIZAR updated_at AUTOMATICAMENTE
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_whatsapp_connections_updated_at
    BEFORE UPDATE ON "whatsapp_connections"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. (OPCIONAL) CRIAR POLÍTICA PARA ADMINS (MASTER)
-- ============================================================================
-- Política especial para usuários MASTER (podem ver tudo)
CREATE POLICY "Master users can view all whatsapp connections" 
ON "whatsapp_connections"
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM "usuarios" 
        WHERE "id" = auth.uid() 
        AND "perfil" = 'MASTER'
    )
);

CREATE POLICY "Master users can manage all whatsapp connections" 
ON "whatsapp_connections"
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM "usuarios" 
        WHERE "id" = auth.uid() 
        AND "perfil" = 'MASTER'
    )
);