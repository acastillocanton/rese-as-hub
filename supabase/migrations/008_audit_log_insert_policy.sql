-- ReseñaHub — migration 008
-- Política INSERT en audit_log para permitir que server actions con
-- contexto-cookie registren auditorías sin tener que pasar por el
-- service-client. Hoy todos los inserts van por `recordAudit()` con
-- service-role (bypass RLS) — ver CLAUDE.md §4.6.
--
-- Esta migración deja la puerta abierta para que futuros endpoints
-- registren su propia auditoría con `actor_id = auth.uid()`. El
-- recordAudit() actual sigue funcionando intacto.
--
-- Idempotente: IF NOT EXISTS y DROP POLICY IF EXISTS.

-- 1. Columna actor_id (nullable, referencia auth.users).
alter table public.audit_log
  add column if not exists actor_id uuid references auth.users(id) on delete set null;

create index if not exists audit_log_actor_idx on public.audit_log(actor_id);

-- 2. Política INSERT: el usuario solo puede registrarse como autor de sus
--    propios audits. Para registrar de parte de otros (cron, webhooks),
--    seguir usando el service-role.
drop policy if exists audit_log_self_insert on public.audit_log;
create policy audit_log_self_insert on public.audit_log
  for insert to authenticated
  with check (actor_id = auth.uid());
