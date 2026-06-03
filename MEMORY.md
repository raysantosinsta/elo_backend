# MEMORY.md

## Projeto

Backend principal do ELO/Conjugal em NestJS, Prisma e PostgreSQL.

Raiz:

```text
C:\CONJUGAL\elo-produtivo-backend-new
```

Responsabilidades principais:

- API REST do produto.
- Autenticacao e autorizacao.
- Multiempresa/multitenancy.
- Persistencia via Prisma.
- Integracoes externas.
- Fluxo financeiro SaaS recorrente com Asaas.

## Comandos

Instalar/usar dependencias ja existentes:

```powershell
npm install
```

Rodar local:

```powershell
npm run start:dev
```

Validar Prisma:

```powershell
npx prisma validate
npx prisma generate
```

Build:

```powershell
npm run build
```

Aplicar migrations:

```powershell
npx prisma migrate deploy
```

## Prisma

Schema principal:

```text
C:\CONJUGAL\elo-produtivo-backend-new\prisma\schema.prisma
```

Migration do fluxo Asaas SaaS:

```text
C:\CONJUGAL\elo-produtivo-backend-new\prisma\migrations\20260603_billing_asaas_saas_recorrente\migration.sql
```

Modelos adicionados para billing:

- `BillingPlan`
- `BillingSubscription`
- `BillingPayment`
- `AsaasWebhookEvent`
- `Partner`
- `PartnerReferral`
- `PartnerCommission`
- `PartnerWithdrawal`

Campos adicionados em `Company`:

- `billingStatus`
- `trialStart`
- `trialEnd`
- `asaasCustomerId`
- `referredByPartnerId`

## Modulo Billing

Arquivos principais:

```text
C:\CONJUGAL\elo-produtivo-backend-new\src\billing
```

Endpoints ficam sob:

```text
/billing
```

Funcionalidades implementadas:

- Cadastro e listagem de planos.
- Inicio/expiracao de trial.
- Sincronizacao de customer no Asaas.
- Criacao de assinatura.
- Consulta de billing da empresa.
- Webhook publico do Asaas.
- Cadastro e revisao de parceiros.
- Indicacoes publicas por codigo de parceiro.
- Dashboard de parceiro.
- Listagem/liberacao de comissoes.
- Solicitacao, revisao e pagamento de saques.
- KPIs administrativos.

## Variaveis de Ambiente

```env
ASAAS_API_KEY=...
ASAAS_WEBHOOK_TOKEN=...
ASAAS_ENV=sandbox
PARTNER_COMMISSION_HOLD_DAYS=7
```

`ASAAS_ENV=production` muda a URL padrao para producao. Em sandbox, usa a URL de sandbox por padrao.

## Cuidados

- Verificar roles antes de expor endpoints administrativos.
- Preservar isolamento por empresa.
- Webhook do Asaas deve validar token.
- Nao processar evento duplicado duas vezes.
- Comissao so deve ser paga depois de liberada e vinculada ao saque.
- Saque deve guardar dados de NFS-e/revisao para auditoria.
- Nao mexer em rotas/driver quando o escopo for financeiro, a menos que o usuario peca.

