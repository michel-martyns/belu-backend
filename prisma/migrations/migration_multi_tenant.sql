-- ============================================================================
-- MIGRATION: Multi-tenant
-- Este script migra o banco de dados existente para a arquitetura multi-tenant
-- ============================================================================

-- 1. Criar enum PlanType se não existir
DO $$ BEGIN
    CREATE TYPE "PlanType" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Criar enum UserRole se não existir
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OPERATOR', 'PROVIDER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Criar tabela Tenant
CREATE TABLE IF NOT EXISTS "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL DEFAULT 'FREE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- 4. Criar índices para Tenant
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX IF NOT EXISTS "Tenant_slug_idx" ON "Tenant"("slug");
CREATE INDEX IF NOT EXISTS "Tenant_isActive_idx" ON "Tenant"("isActive");

-- 5. Adicionar coluna tenantId nas tabelas existentes (se não existir)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" DEFAULT 'ADMIN';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- 6. Função para gerar slug único
CREATE OR REPLACE FUNCTION generate_slug(base_name TEXT) RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Remove acentos e caracteres especiais
    base_slug := lower(
        regexp_replace(
            regexp_replace(
                translate(base_name, 'áàâãäéèêëíìîïóòôõöúùûüñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑ', 'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'),
                '[^a-zA-Z0-9]+', '-', 'g'
            ),
            '^-+|-+$', '', 'g'
        )
    );

    -- Limita o tamanho
    base_slug := substring(base_slug from 1 for 40);
    final_slug := base_slug;

    -- Verifica unicidade e adiciona contador se necessário
    WHILE EXISTS (SELECT 1 FROM "Tenant" WHERE "slug" = final_slug) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;

    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- 7. Migrar dados existentes: criar um tenant para cada usuário
INSERT INTO "Tenant" ("id", "name", "slug", "plan", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    COALESCE(u."businessName", u."name"),
    generate_slug(COALESCE(u."businessName", u."name", u."email")),
    'FREE'::"PlanType",
    true,
    u."createdAt",
    CURRENT_TIMESTAMP
FROM "User" u
WHERE u."tenantId" IS NULL
ON CONFLICT DO NOTHING;

-- 8. Atualizar usuários com seus respectivos tenants
UPDATE "User" u
SET "tenantId" = t."id"
FROM "Tenant" t
WHERE u."tenantId" IS NULL
AND (
    generate_slug(COALESCE(u."businessName", u."name", u."email")) = t."slug"
    OR t."name" = COALESCE(u."businessName", u."name")
);

-- 9. Atualizar todas as entidades com o tenantId do seu userId
UPDATE "Service" s
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE s."userId" = u."id"
AND s."tenantId" IS NULL;

UPDATE "Provider" p
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE p."userId" = u."id"
AND p."tenantId" IS NULL;

UPDATE "Client" c
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE c."userId" = u."id"
AND c."tenantId" IS NULL;

UPDATE "Appointment" a
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE a."userId" = u."id"
AND a."tenantId" IS NULL;

-- 10. Adicionar constraints NOT NULL (após migração de dados)
-- ATENÇÃO: Só execute esta parte após verificar que todos os registros têm tenantId

-- ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
-- ALTER TABLE "Service" ALTER COLUMN "tenantId" SET NOT NULL;
-- ALTER TABLE "Provider" ALTER COLUMN "tenantId" SET NOT NULL;
-- ALTER TABLE "Client" ALTER COLUMN "tenantId" SET NOT NULL;
-- ALTER TABLE "Appointment" ALTER COLUMN "tenantId" SET NOT NULL;

-- 11. Adicionar foreign keys
ALTER TABLE "User"
ADD CONSTRAINT "User_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Service"
ADD CONSTRAINT "Service_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Provider"
ADD CONSTRAINT "Provider_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Client"
ADD CONSTRAINT "Client_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- 12. Criar índices para tenantId
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX IF NOT EXISTS "Service_tenantId_idx" ON "Service"("tenantId");
CREATE INDEX IF NOT EXISTS "Provider_tenantId_idx" ON "Provider"("tenantId");
CREATE INDEX IF NOT EXISTS "Client_tenantId_idx" ON "Client"("tenantId");
CREATE INDEX IF NOT EXISTS "Appointment_tenantId_date_idx" ON "Appointment"("tenantId", "date");

-- 13. Limpar função temporária
DROP FUNCTION IF EXISTS generate_slug(TEXT);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
