-- 015 · Marcar reseñas duplicadas por client_id (anti-fraude)
--
-- Contexto: cuando un cliente reenvía el enlace `/c/{sales}/{client}` a varias
-- personas (familia, amigos), todas pueden dejar reseñas en Google y el matcher
-- las atribuye al mismo client_id (ventana 48h + similitud). El modelo de
-- atribución se queda como está — las N reseñas siguen vinculadas al mismo
-- sales_id porque eso es útil para el comercial. Lo que añadimos es una marca
-- `is_duplicate` para que sólo la primera (por google_created_at) cuente en
-- KPIs / Excel / pagos.
--
-- Reglas:
--   • La principal por cada client_id = la de google_created_at más antiguo
--     (tie-break por fetched_at ASC y luego id ASC para determinismo).
--   • Las demás → is_duplicate = true.
--   • Filas con removed_at NOT NULL se ignoran (soft-delete).
--   • Filas con client_id NULL no entran en la lógica (unmatched).

-- 1. Columna nueva
alter table public.reviews
  add column if not exists is_duplicate boolean not null default false;

-- 2. Backfill histórico
with ranked as (
  select
    id,
    row_number() over (
      partition by client_id
      order by google_created_at asc, fetched_at asc, id asc
    ) as rn
  from public.reviews
  where client_id is not null
    and removed_at is null
)
update public.reviews r
set is_duplicate = true
from ranked
where r.id = ranked.id
  and ranked.rn > 1;

-- 3. Índice parcial para KPIs (cuentan rápido las "principales" por sales).
create index if not exists reviews_active_principal_idx
  on public.reviews (sales_id, google_created_at desc)
  where is_duplicate = false
    and removed_at is null
    and sales_id is not null;
