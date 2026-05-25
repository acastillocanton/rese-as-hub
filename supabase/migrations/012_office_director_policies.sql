-- ReseñaHub — migration 012
-- Constraint + helper + policies RLS para el rol `office_director`. Tiene que
-- correr DESPUÉS de la 011 (que añadió el valor al enum) en una transacción
-- separada — ver explicación al principio de 011_office_director_enum.sql.
--
-- El director es un admin scoped a UNA ficha (`profiles.location_id`).
-- Misma IA que admin pero restringido a su location. NO accede a /gestores
-- ni /ajustes. Solo el admin general invita/edita/elimina directores.

----------------------------------------------------------------------
-- 1. Profiles: extender check constraint para exigir location_id
-- también a los directores (aparte de sales).
----------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists sales_must_have_location;

alter table public.profiles
  add constraint role_requires_location
  check (
    role not in ('sales', 'office_director')
    or location_id is not null
  );

----------------------------------------------------------------------
-- 2. Helper: devuelve el location_id del director actual, o NULL si
-- el caller no es office_director. Se usa en policies RLS para evitar
-- subqueries repetitivos sobre profiles.
----------------------------------------------------------------------
create or replace function public.current_office_location()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select location_id
  from public.profiles
  where id = auth.uid()
    and role = 'office_director';
$$;

grant execute on function public.current_office_location() to authenticated;

----------------------------------------------------------------------
-- 3. RLS — locations
-- El director ve y actualiza SOLO su location. NO puede crear ni borrar
-- fichas (eso queda solo en admin).
----------------------------------------------------------------------
create policy locations_director_select on public.locations
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and id = public.current_office_location()
  );

create policy locations_director_update on public.locations
  for update to authenticated
  using (
    public.current_role() = 'office_director'
    and id = public.current_office_location()
  )
  with check (
    public.current_role() = 'office_director'
    and id = public.current_office_location()
  );

----------------------------------------------------------------------
-- 4. RLS — profiles
-- El director gestiona los SALES de su location: invitar, editar, eliminar.
-- NO puede:
--   • Tocar perfiles que no sean role='sales' (mismo patrón que migración 005).
--   • Ascender un sales a admin/manager/director (with check refuerza role='sales').
--   • Cambiar el location_id de un sales a otra ficha (with check refuerza scope).
----------------------------------------------------------------------
create policy profiles_director_select on public.profiles
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and role = 'sales'
    and location_id = public.current_office_location()
  );

create policy profiles_director_insert_sales on public.profiles
  for insert to authenticated
  with check (
    public.current_role() = 'office_director'
    and role = 'sales'
    and location_id = public.current_office_location()
  );

create policy profiles_director_update_sales on public.profiles
  for update to authenticated
  using (
    public.current_role() = 'office_director'
    and role = 'sales'
    and location_id = public.current_office_location()
  )
  with check (
    public.current_role() = 'office_director'
    and role = 'sales'
    and location_id = public.current_office_location()
  );

create policy profiles_director_delete_sales on public.profiles
  for delete to authenticated
  using (
    public.current_role() = 'office_director'
    and role = 'sales'
    and location_id = public.current_office_location()
  );

----------------------------------------------------------------------
-- 5. RLS — reviews
-- El director ve y actualiza las reseñas (verificación, soft delete) de su
-- location. NO puede ver reseñas de otras fichas.
----------------------------------------------------------------------
create policy reviews_director_select on public.reviews
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and location_id = public.current_office_location()
  );

create policy reviews_director_update on public.reviews
  for update to authenticated
  using (
    public.current_role() = 'office_director'
    and location_id = public.current_office_location()
  )
  with check (
    public.current_role() = 'office_director'
    and location_id = public.current_office_location()
  );

----------------------------------------------------------------------
-- 6. RLS — clients y share_links
-- El director ve clientes/share_links de los SALES de su location.
-- Subquery sobre profiles (limitado por el index profiles_location_idx).
----------------------------------------------------------------------
create policy clients_director_select on public.clients
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and exists (
      select 1 from public.profiles p
      where p.id = clients.sales_id
        and p.location_id = public.current_office_location()
    )
  );

create policy share_links_director_select on public.share_links
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and location_id = public.current_office_location()
  );

----------------------------------------------------------------------
-- location_secrets y audit_log: SIN policies para office_director.
-- Mantienen el mismo nivel de aislamiento que hoy (solo service-role).
-- Las acciones OAuth pasan por endpoints server-side que usan service-client.
----------------------------------------------------------------------
