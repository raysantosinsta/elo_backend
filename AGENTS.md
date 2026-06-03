# Elo Backend Agents Guide

This repository is the Elo Produtivo NestJS API.

## Stack

- NestJS, TypeScript, Prisma, PostgreSQL/Supabase.
- JWT auth is enforced globally by `JwtAuthGuard`.
- Tenant context is enforced through `TenantInterceptor` and company-scoped services.
- Swagger is enabled outside production at `/api/docs`.
- Metrics are exposed through Prometheus at `/metrics`.

## Agent Rules

- Preserve multi-tenant isolation. Company scoped data must be filtered by the authenticated user's company.
- Do not trust `companyId` from request bodies when it can be derived from the token/context.
- Public endpoints must be explicit and justified.
- DTOs should use validation decorators for request input.
- Services own business rules; controllers should stay thin.
- Prisma changes require checking relations, cascade behavior, indexes, migration impact, and seed impact.
- Never log raw tokens, passwords, reset tokens, WhatsApp tokens, or database URLs.
- Keep Swagger decorators aligned with DTOs for new public API surface.
- Prefer small module-level changes over cross-cutting refactors.

## Required Checks

- Run `npm run lint` when touching backend TypeScript.
- Run `npm test` for service/controller logic changes.
- Run `npm run build` before release or when module wiring changes.
- Run `npx prisma generate` after editing `prisma/schema.prisma`.

## Critical Flows

- Auth, refresh, verify token, reset password.
- Company and user administration.
- Tasks, kanban columns, flow stages, and flow items.
- Routes, route stops, route completion, and task conversion.
- Notifications and WhatsApp integration.
- Audit logs and metrics.

