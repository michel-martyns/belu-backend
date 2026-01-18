# Belu Backend

API REST para o sistema de gestao de estabelecimentos de beleza e estetica.

## Stack Tecnologica

- **Framework:** NestJS 11
- **Linguagem:** TypeScript
- **Banco de Dados:** PostgreSQL
- **ORM:** Prisma
- **Cache:** Redis
- **Filas:** BullMQ
- **Autenticacao:** Passport JWT
- **Validacao:** class-validator + class-transformer
- **Documentacao:** Swagger/OpenAPI

## Modulos Implementados

### Core
- **Auth** - Autenticacao JWT com refresh tokens
- **Users** - Gestao de usuarios do sistema
- **Tenant** - Multi-tenancy com isolamento de dados

### Agendamentos
- **Appointments** - Agendamentos com verificacao de conflitos
- **Waitlist** - Lista de espera para horarios indisponiveis

### Cadastros
- **Clients** - Clientes com soft delete
- **Providers** - Profissionais com horarios e servicos
- **Services** - Catalogo de servicos

### Avaliacoes
- **Reviews** - Avaliacoes de clientes para profissionais
- Cache de estatisticas por profissional

### Financeiro
- **Financial** - Transacoes, categorias, metodos de pagamento
- **Commissions** - Comissoes de profissionais

### Estoque
- **Inventory** - Produtos, categorias, movimentacoes
- Alertas de estoque baixo

### CRM
- **Leads** - Funil de vendas com tags e interacoes
- Conversao de lead para cliente

### Marketing
- **Marketing** - Campanhas e calendario
- **Notifications** - Templates e envio de notificacoes

### Outros
- **Page Config** - Page builder para pagina publica
- **Client Portal** - Portal de autoatendimento
- **Digital Signature** - Assinatura digital de documentos
- **Google Calendar** - Sincronizacao com Google Calendar
- **Payments** - Integracao com gateways de pagamento
- **Billing** - Gestao de assinaturas e planos

## Estrutura de Diretorios

```
src/
├── common/
│   ├── decorators/         # @CurrentUser, @RequirePermissions
│   ├── guards/             # JwtAuthGuard, PermissionsGuard
│   ├── interceptors/       # AuditInterceptor
│   ├── filters/            # Exception filters
│   └── permissions/        # Enum de permissoes e roles
├── modules/
│   ├── auth/               # Autenticacao
│   ├── users/              # Usuarios
│   ├── tenant/             # Multi-tenancy
│   ├── clients/            # Clientes
│   ├── providers/          # Profissionais
│   ├── services/           # Servicos
│   ├── appointments/       # Agendamentos
│   ├── waitlist/           # Lista de espera
│   ├── reviews/            # Avaliacoes
│   ├── financial/          # Financeiro
│   ├── inventory/          # Estoque
│   ├── leads/              # CRM
│   ├── marketing/          # Marketing
│   ├── notifications/      # Notificacoes
│   ├── public/             # Endpoints publicos
│   └── ...
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── redis/
│   ├── redis.module.ts
│   └── redis.service.ts
├── queues/                 # BullMQ jobs
└── app.module.ts
```

## Endpoints Principais

### Publicos (sem autenticacao)
```
GET    /api/public/{slug}                    # Dados do estabelecimento
GET    /api/public/{slug}/services           # Servicos disponiveis
GET    /api/public/{slug}/providers          # Profissionais disponiveis
GET    /api/public/{slug}/available-slots    # Horarios disponiveis
POST   /api/public/{slug}/appointments       # Criar agendamento
POST   /api/public/{slug}/waitlist           # Entrar na lista de espera
GET    /api/public/{slug}/waitlist/:id       # Status na lista de espera
```

### Autenticados (Bearer Token)
```
# Waitlist
GET    /api/waitlist              # Listar lista de espera
GET    /api/waitlist/stats        # Estatisticas
GET    /api/waitlist/:id          # Detalhes
POST   /api/waitlist              # Criar entrada manual
PATCH  /api/waitlist/:id          # Atualizar
DELETE /api/waitlist/:id          # Remover
POST   /api/waitlist/:id/notify   # Notificar cliente
POST   /api/waitlist/:id/schedule # Marcar como agendado
POST   /api/waitlist/:id/cancel   # Cancelar

# Reviews
GET    /api/reviews               # Listar avaliacoes
POST   /api/reviews               # Criar avaliacao
POST   /api/reviews/:id/respond   # Responder avaliacao

# E muitos outros...
```

## Comandos

```bash
# Desenvolvimento
npm run start:dev        # Modo watch
npm run build            # Build de producao
npm run start:prod       # Servidor de producao

# Prisma
npx prisma generate      # Gerar tipos
npx prisma db push       # Sincronizar schema
npx prisma migrate dev   # Criar migration
npx prisma studio        # Interface visual

# Testes
npm run test             # Testes unitarios
npm run test:e2e         # Testes E2E
npm run test:cov         # Coverage
```

## Variaveis de Ambiente

```env
# Database (client_encoding=UTF8 garante suporte a caracteres especiais)
DATABASE_URL=postgresql://user:pass@localhost:5432/belu?schema=public&client_encoding=UTF8

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Email (opcional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass

# Storage (opcional)
AWS_S3_BUCKET=belu-uploads
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

## Encoding UTF-8

Para garantir suporte correto a caracteres especiais (acentos, cedilha, etc.):

1. **DATABASE_URL** deve incluir `&client_encoding=UTF8`
2. **PostgreSQL** deve ter sido criado com encoding UTF-8:
   ```sql
   CREATE DATABASE belu WITH ENCODING 'UTF8';
   ```

## Sistema de Permissoes

O sistema usa permissoes granulares baseadas em roles:

```typescript
enum Permission {
  CLIENTS_VIEW, CLIENTS_CREATE, CLIENTS_EDIT, CLIENTS_DELETE,
  APPOINTMENTS_VIEW, APPOINTMENTS_CREATE, APPOINTMENTS_EDIT, APPOINTMENTS_CANCEL,
  // ... outras permissoes
}
```

Roles disponiveis:
- **SUPER_ADMIN** - Acesso total (nivel plataforma)
- **ADMIN** - Dono do estabelecimento (acesso total ao tenant)
- **MANAGER** - Gerente (quase tudo exceto config criticas)
- **OPERATOR** - Recepcionista (operacoes do dia a dia)
- **PROVIDER** - Profissional (acesso limitado aos proprios dados)

## Multi-tenancy

Todos os dados sao isolados por `tenantId`:
- Middleware de tenant automatico
- Queries sempre filtram por tenant
- Guards garantem acesso apenas ao proprio tenant

## Cache Redis

Padrao de cache: `{entidade}:{tenantId}:{identificador}`

```typescript
// Exemplo
const cacheKey = `waitlist:${tenantId}:all`;
return this.redis.getOrSet(cacheKey, async () => {...}, 300);
```

## Documentacao Adicional

- Swagger UI disponivel em `/api/docs` (quando em desenvolvimento)
- [Frontend README](../belu-frontend/README.md)
- [ROADMAP](../belu-frontend/ROADMAP.md)
