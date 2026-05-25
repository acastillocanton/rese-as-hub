-- ReseñaHub — migration 014
-- Multi-marca: cada `location` pertenece a una de las dos marcas operativas
-- del grupo Marina d'Or. La marca gobierna:
--   • el subtitle del sidebar/topbar (p.ej. "Director · Marina d'Or
--     Construcciones" vs "Director · Inseryal by Marina d'Or"),
--   • el breadcrumb de la topbar,
--   • la plantilla del mensaje que el comercial copia al cliente
--     ("...de {marca}"),
--   • el logo y la firma del email transaccional al comercial.
--
-- NO afecta a RLS (el scope sigue siendo por location_id / director_id /
-- profile.role), ni al cron, ni al matcher, ni al routing.
--
-- Hoy las 7 fichas siguen el patrón ya por nombre:
--   • 2 con prefijo "Marina d'Or Construcciones" (Castellón, Valencia).
--   • 5 con prefijo "Inseryal by Marina d'Or" (Oropesa, Pardiñas, Príncipe
--     de Vergara, Leganés, Chamberí).
-- El backfill detecta por LIKE sobre `name`; a partir de esta migración
-- gobierna la columna, no el name (el name puede renombrarse libremente).
--
-- Apply after 013_director_id.sql.

create type brand_enum as enum ('inseryal', 'marina_dor_construcciones');

alter table public.locations
  add column if not exists brand brand_enum not null default 'inseryal';

update public.locations
  set brand = 'marina_dor_construcciones'
  where name ilike 'Marina d''Or Construcciones%';

create index if not exists locations_brand_idx on public.locations(brand);

-- Verificación esperada tras correr:
--   select brand, count(*) from locations group by brand;
--     inseryal                    | 5
--     marina_dor_construcciones   | 2
