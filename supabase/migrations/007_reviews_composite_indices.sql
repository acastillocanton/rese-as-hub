-- ReseñaHub — migration 007
-- Índices compuestos sobre `reviews` para acelerar queries por (comercial,
-- rango) y (ficha, rango) que hoy dependen de un index merge.
--
-- Las pantallas que consultan así:
--   - /panel/resenas   → reviews where sales_id = $1 and google_created_at >= $2
--   - /comerciales/[slug] (admin) → mismo patrón
--   - /resenas/verificacion → reviews where match_state = $1 (ya existe índice)
--   - dashboard agregados por ficha → location_id + rango
--
-- Crear ANTES de tener volumen real para evitar lock prolongado en producción.
-- Si la tabla está vacía, son índices instantáneos.
--
-- Idempotente: IF NOT EXISTS para que aplicarla 2 veces no rompa.

create index if not exists reviews_sales_created_idx
  on public.reviews (sales_id, google_created_at desc)
  where sales_id is not null;

create index if not exists reviews_location_created_idx
  on public.reviews (location_id, google_created_at desc);

-- Índice parcial para el cliente — pocas reseñas tienen client_id (las
-- atribuidas via slug del cliente). Index parcial = más pequeño y rápido.
create index if not exists reviews_client_created_idx
  on public.reviews (client_id, google_created_at desc)
  where client_id is not null;

-- Útil para el dashboard del admin que agrega reseñas pendientes por ficha
-- (la verificación filtra por match_state IN ('pending', 'unmatched')).
create index if not exists reviews_state_created_idx
  on public.reviews (match_state, google_created_at desc);
