-- ReseñaHub — demo seed (idempotent-ish, run once on dev environments)
-- Creates demo locations only. Profiles must be created via Supabase Auth + invite flow.

insert into public.locations (name, oauth_status)
values
  ('Inseryal by Marina d''Or — Oropesa',  'disconnected'),
  ('Inseryal by Marina d''Or — Peñíscola', 'disconnected'),
  ('Inseryal by Marina d''Or — Cullera',   'disconnected')
on conflict do nothing;
