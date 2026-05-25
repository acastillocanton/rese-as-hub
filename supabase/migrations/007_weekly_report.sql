-- ReseñaHub — migración 007: campos para el parte semanal de Raquel
--
-- Esta migración añade los campos que necesita el export Excel para reproducir
-- al 100% el "Parte semanal de reseñas" que Raquel Piquer compila a mano:
--
--   1) Departamento de ventas en `profiles` (Nacional / Internacional /
--      Castellón / Valencia) para repartir comerciales en hojas.
--   2) Idioma del comercial internacional (la 3ª columna "ZONA" del parte
--      cuando el comercial pertenece a ese departamento — los nacionales y
--      Castellón/Valencia usan el nombre de la ficha como ZONA).
--   3) Motivo de pausa obligatorio cuando `status='paused'` (Vacaciones /
--      Baja médica / Permiso laboral) — antes era texto libre fuera del sistema.
--   4) Notas libres por comercial (aparecen inline en el parte, p.ej.
--      "Baja médica hasta el 16 de marzo").
--   5) Estado 'archived' para soft delete: cuando se "elimina" un comercial
--      sus reseñas siguen vinculadas a su profile, lo que permite calcular la
--      fila "RESEÑAS BAJAS COMERCIALES" del parte.
--   6) Cache de `total_review_count` y `average_rating` por ficha de Google
--      para la cabecera del parte ("RESEÑAS: <ficha>: 1.567 RESEÑAS
--      ACUMULADAS. VALORACIÓN: 4,9 PUNTOS DE 5"). Se mantienen editables a
--      mano hasta que Google apruebe la cuota de la API (caso 5-5855000041022)
--      y el cron pueda escribirlos en automático.
--
-- Ejecutar en Supabase Dashboard → SQL Editor en el proyecto
-- `zejwmznusszqlwhevaqv` después de aplicar 006_profile_avatars.sql.

----------------------------------------------------------------------
-- Nuevos enums
----------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pause_reason_enum') then
    create type pause_reason_enum as enum ('vacaciones', 'baja_medica', 'permiso_laboral');
  end if;
  if not exists (select 1 from pg_type where typname = 'sales_department_enum') then
    create type sales_department_enum as enum ('nacional', 'internacional', 'castellon', 'valencia');
  end if;
end$$;

-- Añadir valor 'archived' al enum existente. ALTER TYPE ... ADD VALUE no
-- admite IF NOT EXISTS en versiones antiguas de Postgres, pero Supabase 15+ sí.
alter type profile_status_enum add value if not exists 'archived';

----------------------------------------------------------------------
-- Nuevas columnas en profiles
----------------------------------------------------------------------
alter table public.profiles
  add column if not exists department    sales_department_enum,
  add column if not exists language      text,
  add column if not exists paused_reason pause_reason_enum,
  add column if not exists notes         text,
  add column if not exists archived_at   timestamptz;

-- Constraint existente "sales_must_have_location": añadir excepción para
-- comerciales archivados (cuyo location_id puede quedar NULL si la ficha
-- desaparece en el futuro).
alter table public.profiles drop constraint if exists sales_must_have_location;
alter table public.profiles add constraint sales_must_have_location
  check (
    role <> 'sales'
    or status = 'archived'
    or location_id is not null
  );

-- status='paused' exige motivo. status='archived' exige timestamp.
alter table public.profiles drop constraint if exists paused_requires_reason;
alter table public.profiles add constraint paused_requires_reason
  check (status <> 'paused' or paused_reason is not null);

alter table public.profiles drop constraint if exists archived_requires_timestamp;
alter table public.profiles add constraint archived_requires_timestamp
  check (status <> 'archived' or archived_at is not null);

-- language solo tiene sentido cuando department='internacional'.
-- Permitimos department NULL para profiles que aún no se han clasificado
-- (admins, gestores, comerciales antiguos antes del backfill manual).
alter table public.profiles drop constraint if exists language_only_for_internacional;
alter table public.profiles add constraint language_only_for_internacional
  check (
    department is null
    or (department  = 'internacional' and language is not null)
    or (department <> 'internacional' and language is null)
  );

----------------------------------------------------------------------
-- Cache de rating Google en locations
----------------------------------------------------------------------
alter table public.locations
  add column if not exists total_review_count int,
  add column if not exists average_rating     numeric(2,1),
  add column if not exists rating_updated_at  timestamptz,
  add column if not exists rating_source      text;  -- 'manual' | 'google_api'

alter table public.locations drop constraint if exists average_rating_in_range;
alter table public.locations add constraint average_rating_in_range
  check (average_rating is null or (average_rating >= 1.0 and average_rating <= 5.0));

alter table public.locations drop constraint if exists total_review_count_non_negative;
alter table public.locations add constraint total_review_count_non_negative
  check (total_review_count is null or total_review_count >= 0);

alter table public.locations drop constraint if exists rating_source_valid;
alter table public.locations add constraint rating_source_valid
  check (rating_source is null or rating_source in ('manual', 'google_api'));

----------------------------------------------------------------------
-- RLS: permitir que admin (y reviews_manager) actualicen los campos de
-- locations añadidos arriba. La política existente
-- "locations_admin_all" de la migración 002 ya cubre este caso porque
-- aplica a todas las columnas; no se necesita política adicional.
----------------------------------------------------------------------

-- Backfill: NO se hace automáticamente. El admin debe asignar departamento
-- (y language si aplica) a cada comercial existente desde
-- /comerciales/[slug]. Hasta que se asigne, el comercial aparece como
-- "Sin departamento" en el parte y no se incluye en ninguna de las 4 hojas.
