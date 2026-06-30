-- ReseñaHub — migration 031
-- Comercial multi-oficina ("escrituradora").
--
-- La persona que acompaña al cliente en la firma de la escrituración pide
-- reseñas como un comercial más, PERO no pertenece a una sola ficha de Google:
-- escritura viviendas de cualquier promoción, así que sus clientes caen en
-- Oropesa (playa), Castellón o Valencia. La reseña debe aterrizar en la ficha
-- de Google de la oficina correcta (valoración pública de esa oficina) pero
-- atribuirse a ELLA (su panel, ranking, comisión).
--
-- Modelado (decisión de negocio): NO es un rol nuevo. Es un `sales` con flag
-- `cross_location = true` y SIN `location_id`. Cada uno de sus clientes guarda
-- su propia `location_id` (la ficha elegida al crear el cliente). La landing y
-- el share_link usan la ficha del cliente; todo lo demás del rol `sales` se
-- hereda intacto (la RLS de sales gatea por `sales_id`, no por ficha).
--
-- Ver CLAUDE.md §4 (entrada de comercial multi-oficina).

----------------------------------------------------------------------
-- 1. profiles.cross_location — marca al productor multi-oficina.
----------------------------------------------------------------------
alter table public.profiles
  add column if not exists cross_location boolean not null default false;

----------------------------------------------------------------------
-- 2. Relajar role_requires_location (mig 012): un productor multi-oficina
--    no tiene ficha fija (location_id null). El resto de sales/directores
--    siguen obligados a tener location_id.
----------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists role_requires_location;

alter table public.profiles
  add constraint role_requires_location
  check (
    role not in ('sales', 'office_director')
    or location_id is not null
    or cross_location = true
  );

----------------------------------------------------------------------
-- 3. clients.location_id — ficha destino del cliente (la elegida por el
--    comercial multi-oficina al crearlo). NULL = hereda la ficha del sales
--    (comportamiento actual de todos los comerciales normales).
----------------------------------------------------------------------
alter table public.clients
  add column if not exists location_id uuid references public.locations(id);

----------------------------------------------------------------------
-- 4. locations.escrituracion_target — define el set de fichas que el
--    comercial multi-oficina puede elegir en el selector. Data-driven y
--    editable sin deploy. Backfill: Oropesa / Castellón / Valencia.
----------------------------------------------------------------------
alter table public.locations
  add column if not exists escrituracion_target boolean not null default false;

update public.locations
  set escrituracion_target = true
  where name ilike '%oropesa%'
     or name ilike '%castell%'
     or name ilike '%valencia%';

----------------------------------------------------------------------
-- 5. Congelar cross_location en la auto-edición de perfil.
-- OBLIGATORIO (regla CLAUDE.md §4.36): si un sales pudiera auto-editarlo vía
-- PostgREST directo, se autoconvertiría en multi-oficina (y, al quedar exento
-- de la atadura a una ficha, podría crear clientes en cualquier oficina).
-- Reescribimos la policy completa (mig 021 + 022 + 026 + 027) añadiendo la
-- línea de cross_location.
----------------------------------------------------------------------
drop policy if exists profiles_self_update on public.profiles;

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role           =            (select p.role           from public.profiles p where p.id = auth.uid())
    and slug           =            (select p.slug           from public.profiles p where p.id = auth.uid())
    and previous_slug   is not distinct from (select p.previous_slug   from public.profiles p where p.id = auth.uid())
    and monthly_goal   =            (select p.monthly_goal   from public.profiles p where p.id = auth.uid())
    and commission_rate is not distinct from (select p.commission_rate from public.profiles p where p.id = auth.uid())
    and commission_cap  is not distinct from (select p.commission_cap  from public.profiles p where p.id = auth.uid())
    and cross_location  is not distinct from (select p.cross_location  from public.profiles p where p.id = auth.uid())
    and location_id     is not distinct from (select p.location_id     from public.profiles p where p.id = auth.uid())
    and director_id     is not distinct from (select p.director_id     from public.profiles p where p.id = auth.uid())
    and department      is not distinct from (select p.department      from public.profiles p where p.id = auth.uid())
    and language        is not distinct from (select p.language        from public.profiles p where p.id = auth.uid())
    and (
      status = (select p.status from public.profiles p where p.id = auth.uid())
      -- Excepción: primer login (flip invited → active en /auth/confirm).
      or (
        (select p.status from public.profiles p where p.id = auth.uid()) = 'invited'
        and status = 'active'
      )
    )
  );
