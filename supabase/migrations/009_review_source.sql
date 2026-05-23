-- ReseñaHub — migration 009
-- Columna `source` en reviews para distinguir de dónde vino cada reseña:
--   'business_profile' → cron oficial /api/cron/sync-google-reviews (default).
--   'places_api'       → cron alternativo /api/cron/sync-places-reviews mientras
--                        esperamos la aprobación de cuota de Business Profile.
--   'manual'           → importador manual en /manager/resenas/importar.
--
-- Cuando llegue la cuota oficial de Business Profile API, las mismas reseñas
-- pueden entrar dos veces (una como places_api, otra como business_profile)
-- porque los review_id de cada API NO están garantizados a coincidir. El
-- importador manual ya prefija `google_review_id` con "manual:" + UUID, y el
-- cron de Places lo prefija con "places:" — el unique (location_id,
-- google_review_id) impide colisiones dentro de cada source, pero NO entre
-- ellas (esa es la intención: ver el duplicado, deduplicar a mano u
-- on-demand una sola vez tras el primer run exitoso de Business Profile).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Reversible: para tirar la migración, ejecutar a mano en SQL Editor:
--   alter table public.reviews drop column if exists source;
--   drop type if exists review_source_enum;

-- 1. Enum del origen
do $$
begin
  if not exists (select 1 from pg_type where typname = 'review_source_enum') then
    create type review_source_enum as enum ('business_profile', 'places_api', 'manual');
  end if;
end$$;

-- 2. Columna en reviews. Default 'business_profile' para no romper datos
--    existentes (todos los insertados antes de esta migración vienen del
--    cron oficial — o están vacíos, en cuyo caso el default da igual).
alter table public.reviews
  add column if not exists source review_source_enum not null default 'business_profile';

-- 3. Índice para filtrar por source rápido (dedup, dashboards futuros).
create index if not exists reviews_source_idx on public.reviews(source);
