-- 017 · Tracking de idempotencia para alertas tempranas por rating bajo
--
-- Contexto: el cron envía un email a admin/manager/director/sales cuando
-- entra una reseña ≤2★ (1 o 2 estrellas). Para evitar reenviar el email
-- cuando una reseña pasa de unmatched → counted en sincronizaciones
-- posteriores (mismo google_review_id, distinto match_state), marcamos
-- la columna `low_rating_alerted_at` tras el primer envío exitoso.
--
-- Ver CLAUDE.md §4.29.

alter table public.reviews
  add column if not exists low_rating_alerted_at timestamptz;

-- Índice parcial: solo reseñas ≤2★ que aún no han disparado alerta. La
-- mayoría de filas serán 4★/5★ — indexar todo el rango sería desperdiciar
-- espacio. El cron consulta este subconjunto para decidir si enviar.
create index if not exists reviews_low_rating_pending_alert_idx
  on public.reviews (id)
  where rating <= 2 and low_rating_alerted_at is null;

-- Sin políticas RLS adicionales. La columna solo la actualiza el service-
-- client desde el cron (via createServiceClient en lib/google/sync-places.ts
-- y app/api/cron/sync-google-reviews/route.ts). No es exposable al cliente.
