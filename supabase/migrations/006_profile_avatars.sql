-- ReseñaHub — migration 006
-- Soporte de foto de perfil para todos los roles (admin, sales, reviews_manager).
--
-- Tres cambios:
--   1. Columna `avatar_url` en profiles para guardar la URL pública del archivo.
--   2. Bucket público de Storage `avatars` con el path `{user_id}/avatar.{ext}`.
--   3. Políticas de Storage para que cada usuario solo pueda escribir su carpeta.
--
-- RLS de profiles para UPDATE de avatar_url: NO necesita política nueva. La
-- política `profiles_self_update` (migración 002) ya permite al usuario
-- actualizar su propia fila siempre que el `role` no cambie. avatar_url no
-- es role, así que cae dentro del permiso.

----------------------------------------------------------------------
-- 1. Columna avatar_url
----------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text;

----------------------------------------------------------------------
-- 2. Bucket público `avatars`
----------------------------------------------------------------------
-- public = true → el navegador puede pintar la imagen sin token de auth.
-- Si no existe se crea; si existía se ignora (idempotente).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

----------------------------------------------------------------------
-- 3. Storage policies para el bucket avatars
----------------------------------------------------------------------
-- Convención del path: el primer segmento es el user id. Ej:
--   avatars/a1b2c3d4-…/avatar.png
-- Esa carpeta solo la puede tocar su dueño.

create policy "avatars_user_can_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_user_can_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_user_can_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT no requiere policy porque el bucket es public — todo el mundo puede
-- LEER los archivos. Solo lo controlamos por URL (no se enumera el bucket).
