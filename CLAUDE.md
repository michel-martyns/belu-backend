# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projetos Relacionados

- **Backend (este projeto):** `c:\Users\miche\OneDrive\Documentos\GitHub\belu-backend`
- **Frontend:** `c:\Users\miche\OneDrive\Documentos\GitHub\belu-frontend` - Qualquer alteração no frontend deve ser feita nessa pasta

## Comandos de Desenvolvimento

```bash
# Instalação e setup inicial
npm install
npx prisma generate

# Desenvolvimento
npm run start:dev          # Watch mode com hot-reload

# Build e produção
npm run build
npm run start:prod

# Testes
npm run test               # Testes unitários
npm run test:watch         # Watch mode
npm run test:cov           # Com cobertura
npm run test:e2e           # Testes E2E

# Para rodar um único teste
npx jest --testPathPattern="nome-do-arquivo.spec.ts"
npx jest --testNamePattern="nome do teste"

# Qualidade de código
npm run lint               # ESLint com auto-fix
npm run format             # Prettier

# Prisma (banco de dados)
npx prisma migrate dev --name nome_migration  # Nova migration
npx prisma db push                             # Sync schema sem migration
npx prisma studio                              # GUI do banco
npx prisma generate                            # Regenerar cliente
```

## Arquitetura

### Visão Geral
Backend NestJS multi-tenant para plataforma SaaS de gestão de clínicas de beleza/estética.

**Stack:** NestJS 11 + TypeScript + PostgreSQL (Prisma) + Redis (cache) + BullMQ (filas)

### Multi-Tenancy
- **Todas as entidades principais têm `tenantId`** para isolamento de dados
- `TenantGuard` garante isolamento automático em rotas protegidas
- JWT inclui `tenantId` nos claims
- Ao criar queries, sempre filtrar por `tenantId` do usuário autenticado

### Estrutura de Módulos
```
src/
├── main.ts              # Bootstrap da aplicação
├── app.module.ts        # Módulo raiz
├── prisma/              # PrismaService com soft delete middleware
├── redis/               # RedisService com fallback para in-memory
├── queues/              # BullMQ para tarefas assíncronas
├── common/
│   ├── guards/          # JwtAuthGuard, TenantGuard, RolesGuard, PlanGuard
│   ├── decorators/      # @CurrentUser(), @Roles(), @Permissions(), @PlanFeature()
│   ├── filters/         # GlobalExceptionFilter
│   └── permissions/     # Definições de permissões
└── modules/             # 31 módulos de features
```

### Módulos Principais
- **auth**: JWT (access 15min + refresh 15d), registro cria Tenant automaticamente
- **tenant**: Gestão de clínicas/negócios
- **appointments**: Agendamentos
- **services**: Catálogo de serviços
- **providers**: Profissionais/staff
- **clients**: Clientes/pacientes
- **client-portal**: Portal de autoatendimento do cliente (auth separada)
- **financial**: Transações e relatórios financeiros
- **storage**: Upload de arquivos (S3/MinIO ou local)
- **email**: Envio via Nodemailer + BullMQ

### Guards e Decorators
```typescript
// Autenticação obrigatória (já aplicado globalmente)
@UseGuards(JwtAuthGuard)

// Controle de acesso por role
@Roles('ADMIN')
@UseGuards(RolesGuard)

// Controle por permissão granular
@Permissions('CREATE_APPOINTMENT')
@UseGuards(PermissionsGuard)

// Controle por plano de assinatura
@PlanFeature('FEATURE_NAME')
@UseGuards(PlanGuard)

// Obter usuário autenticado
@CurrentUser() user: JwtPayload
```

### Soft Deletes
Models `Service`, `Provider`, `Client` usam soft delete via middleware do Prisma. Queries automaticamente filtram registros deletados.

### Filas (BullMQ)
Queues: `emails`, `notifications`, `whatsapp`, `billing`, `reports`
Dashboard em `/admin/queues`

### Cache (Redis)
Chaves seguem padrão: `{entidade}:{tenantId}:{identificador}`
Fallback para cache in-memory se Redis indisponível.

## Padrões de Código

### DTOs
- Usar `class-validator` para validação
- Usar `@Transform` do `class-transformer` para conversão de tipos (query params vêm como string)
- Sufixos: `.dto.ts` e `.entity.ts`

### Novos Endpoints
1. Criar DTO com validações
2. Adicionar método no Service (usar `tenantId` do user)
3. Adicionar rota no Controller com guards apropriados
4. Prisma queries sempre incluir `where: { tenantId }`

### Testes
Arquivos `*.spec.ts` na mesma pasta do arquivo testado. Jest com ts-jest.

## Variáveis de Ambiente

Principais (ver `.env.example` para todas):
- `DATABASE_URL`: PostgreSQL connection string (incluir `&client_encoding=UTF8` para suporte a caracteres especiais)
- `JWT_SECRET`: Chave secreta para tokens
- `REDIS_URL`: Opcional, fallback para in-memory
- `SMTP_*`: Configurações de email
- `S3_*`: Armazenamento de arquivos (opcional, fallback local)

```env
# Exemplo de DATABASE_URL com encoding UTF-8
DATABASE_URL="postgresql://user:pass@localhost:5432/belu?schema=public&client_encoding=UTF8"
```

## Health Checks

- `/health` - Status completo
- `/health/live` - Liveness probe (Kubernetes)
- `/health/ready` - Readiness probe (Kubernetes)
