-- 004_google_oauth.sql
--
-- Añade columnas a public.locations para soportar el flujo OAuth + sync con
-- Google Business Profile API.
--
-- - google_location_resource: el resource name que usa la Business Profile API
--   internamente (formato `accounts/{aid}/locations/{lid}`). Distinto del
--   google_place_id (que es el identificador de Google Maps). La API de
--   reviews requiere este resource name.
-- - google_account_email: email de la cuenta de Google que autorizó la
--   conexión. Lo mostramos al admin en /fichas para que sepa con qué
--   cuenta está conectada cada ficha.
-- - oauth_last_sync_at: timestamp del último sync exitoso del cron. Para
--   debug y para mostrarlo en la UI.
-- - oauth_last_sync_error: último error de sincronización (texto crudo del
--   error de la API). Si está populado, el cron falló en el último intento.
--
-- Los tokens OAuth siguen viviendo en location_secrets (que ya tiene
-- oauth_refresh_token, oauth_access_token y expires_at). Esa tabla
-- es service-role only (sin políticas RLS), así nunca llegan al cliente.

alter table public.locations
  add column if not exists google_location_resource text,
  add column if not exists google_account_email text,
  add column if not exists oauth_last_sync_at timestamptz,
  add column if not exists oauth_last_sync_error text;

comment on column public.locations.google_location_resource is
  'Business Profile API resource name (e.g. "accounts/123/locations/456"). Distinto de google_place_id.';
comment on column public.locations.google_account_email is
  'Email de la cuenta de Google que autorizó la conexión OAuth.';
comment on column public.locations.oauth_last_sync_at is
  'Timestamp del último sync exitoso del cron sync-google-reviews.';
comment on column public.locations.oauth_last_sync_error is
  'Último error de sincronización (crudo). Si NULL, el último sync fue OK.';
