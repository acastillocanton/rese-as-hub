-- ReseñaHub — migration 010
-- Soft delete de reseñas eliminadas en Google.
--
-- Casos cubiertos:
--   - El cliente borra su reseña → próximo sync detecta su ausencia y la
--     marca con removed_at = now(). Sigue en BD por si Google la vuelve a
--     mostrar (entonces el sync restaura removed_at = NULL).
--   - El admin/gestor marca manualmente desde /resenas/verificacion cuando
--     ve en Google Maps una reseña antigua eliminada que el cron no detectó
--     (porque está fuera del top-5 de Places API).
--
-- Filtrado de listados: todos los queries que cuentan o muestran reseñas
-- deben añadir `removed_at IS NULL` (o trabajar contra la VIEW
-- `reviews_active`). Las stats no incluyen eliminadas — esa es la
-- intención del soft delete.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Reversible: drop column removed_at; drop view reviews_active.

-- 1. Columna nullable timestamptz
alter table public.reviews
  add column if not exists removed_at timestamptz;

-- 2. Índice parcial: la mayoría de queries piden NOT NULL → solo indexamos
--    cuando está marcada (mucho más pequeño). Si en el futuro se quiere
--    filtrar por removed_at IS NULL es trivial porque el resto de queries
--    ya usan otros índices.
create index if not exists reviews_removed_at_idx
  on public.reviews(removed_at)
  where removed_at is not null;

-- 3. View de conveniencia para queries simples que quieran "reseñas vivas".
--    Los queries actuales pueden seguir contra reviews + filtro, no es
--    obligatoria — sólo azúcar sintáctico.
create or replace view public.reviews_active as
  select * from public.reviews where removed_at is null;
