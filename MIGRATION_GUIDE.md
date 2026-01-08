# Guia de Migração Multi-Tenant

Este guia descreve como migrar o sistema Belu para a arquitetura multi-tenant.

## Resumo das Mudanças

### Nova Estrutura

1. **Tenant**: Nova entidade que representa uma clínica/negócio
2. **User**: Agora pertence a um Tenant
3. **Service, Provider, Client, Appointment**: Agora usam `tenantId` em vez de `userId`

### Arquivos Modificados

- `prisma/schema.prisma` - Novo schema com Tenant
- `src/modules/tenant/*` - Novo módulo de Tenant
- `src/modules/auth/*` - Atualizado para criar Tenant no registro
- `src/modules/clients/*` - Usa tenantId
- `src/modules/services/*` - Usa tenantId
- `src/modules/providers/*` - Usa tenantId
- `src/modules/appointments/*` - Usa tenantId
- `src/modules/dashboard/*` - Usa tenantId
- `src/common/decorators/*` - CurrentUser agora inclui tenantId

## Passos para Migração

### 1. Backup do Banco de Dados

```bash
pg_dump -U postgres belu > belu_backup_$(date +%Y%m%d).sql
```

### 2. Atualizar Dependências

```bash
cd backend
npm install
```

### 3. Gerar Cliente Prisma

```bash
npx prisma generate
```

### 4. Executar Migration (Novo banco)

Se for um banco novo, simplesmente execute:

```bash
npx prisma migrate dev --name add_multi_tenant
```

### 5. Migrar Dados Existentes (Banco com dados)

Se você já tem dados no banco, execute o script SQL de migração:

```bash
# Conectar ao banco e executar o script
psql -U postgres -d belu -f prisma/migrations/migration_multi_tenant.sql
```

O script irá:
1. Criar a tabela `Tenant`
2. Criar um Tenant para cada User existente
3. Associar todas as entidades ao Tenant correto
4. Criar os índices e foreign keys

### 6. Verificar Migração

```sql
-- Verificar se todos os registros têm tenantId
SELECT COUNT(*) FROM "User" WHERE "tenantId" IS NULL;
SELECT COUNT(*) FROM "Service" WHERE "tenantId" IS NULL;
SELECT COUNT(*) FROM "Provider" WHERE "tenantId" IS NULL;
SELECT COUNT(*) FROM "Client" WHERE "tenantId" IS NULL;
SELECT COUNT(*) FROM "Appointment" WHERE "tenantId" IS NULL;

-- Todos devem retornar 0
```

### 7. Aplicar Constraints NOT NULL

Após verificar que todos os registros estão corretos:

```sql
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Provider" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "tenantId" SET NOT NULL;
```

### 8. Sincronizar Schema

```bash
npx prisma db push
```

### 9. Reiniciar o Backend

```bash
npm run start:dev
```

## Testando a Migração

### Registro de Novo Usuário

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@clinica.com",
    "password": "123456",
    "name": "Maria Silva",
    "businessName": "Clínica Beleza Total"
  }'
```

Resposta esperada:
```json
{
  "accessToken": "...",
  "user": {
    "id": "...",
    "tenantId": "...",
    "email": "teste@clinica.com",
    "name": "Maria Silva",
    "role": "ADMIN"
  },
  "tenant": {
    "id": "...",
    "name": "Clínica Beleza Total",
    "slug": "clinica-beleza-total",
    "plan": "FREE"
  }
}
```

### Verificar Slug Disponível

```bash
curl "http://localhost:3001/api/auth/check-slug?slug=minha-clinica"
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@clinica.com",
    "password": "123456"
  }'
```

## Rollback (se necessário)

```bash
# Restaurar backup
psql -U postgres -d belu < belu_backup_YYYYMMDD.sql
```

## Próximos Passos

Após a migração bem-sucedida:

1. Atualizar o frontend para usar os novos campos do JWT
2. Implementar página de configurações do Tenant
3. Implementar sistema de planos e limites
4. Implementar página pública da clínica usando o slug

## Suporte

Em caso de problemas, verifique:
1. Logs do backend: `npm run start:dev`
2. Erros no Prisma: `npx prisma studio`
3. Verificar dados: `psql -U postgres -d belu`
