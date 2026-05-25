-- ReseñaHub — migration 013
-- El office_director pasa de scope "una location" a scope "su equipo
-- (sales con director_id = su id)". Una location puede tener varios
-- directores, cada uno con su equipo (p. ej. Internacional con cuatro
-- equipos por idioma).
--
-- Solo aplica al rol office_director. Admin global y reviews_manager
-- mantienen su scope actual (admin = todo, reviews_manager = todo lo de
-- sales). La policy de `locations` para director sigue scoped a
-- location_id (acceso a "su ficha"), no se reescribe.
--
-- Apply after 012_office_director_policies.sql.

----------------------------------------------------------------------
-- 1. Columna director_id en profiles
-- FK auto-referencial al profile del director. Nullable: un sales puede
-- no tener director asignado (queda en el pool del admin/reviews_manager).
-- ON DELETE SET NULL: si se elimina un director, sus sales quedan
-- huérfanos en vez de borrarse.
----------------------------------------------------------------------
alter table public.profiles
  add column if not exists director_id uuid references public.profiles(id) on delete set null;

create index if not exists profiles_director_idx on public.profiles(director_id);

-- Nota: no se puede añadir un CHECK con subquery (Postgres no soporta
-- queries en check constraints). La validación "director_id apunta a
-- un profile con role='office_director' y misma location" vive en las
-- server actions y en las policies WITH CHECK de abajo.

----------------------------------------------------------------------
-- 2. Reescribir policies del director sobre profiles
-- De scope por location_id → scope por director_id = auth.uid().
----------------------------------------------------------------------
drop policy if exists profiles_director_select on public.profiles;
drop policy if exists profiles_director_insert_sales on public.profiles;
drop policy if exists profiles_director_update_sales on public.profiles;
drop policy if exists profiles_director_delete_sales on public.profiles;

create policy profiles_director_select on public.profiles
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and role = 'sales'
    and director_id = auth.uid()
  );

-- INSERT: el director invita a SU equipo. Forzamos:
--  • role = 'sales'
--  • director_id = el caller (nadie crea sales "para otro director")
--  • location_id = la ficha del caller (coherencia visual con /fichas)
create policy profiles_director_insert_sales on public.profiles
  for insert to authenticated
  with check (
    public.current_role() = 'office_director'
    and role = 'sales'
    and director_id = auth.uid()
    and location_id = public.current_office_location()
  );

-- UPDATE: el director edita SU equipo. No puede cambiar el director_id
-- (la fila nueva sigue apuntando a él) ni ascender el sales a otro rol.
create policy profiles_director_update_sales on public.profiles
  for update to authenticated
  using (
    public.current_role() = 'office_director'
    and role = 'sales'
    and director_id = auth.uid()
  )
  with check (
    public.current_role() = 'office_director'
    and role = 'sales'
    and director_id = auth.uid()
  );

create policy profiles_director_delete_sales on public.profiles
  for delete to authenticated
  using (
    public.current_role() = 'office_director'
    and role = 'sales'
    and director_id = auth.uid()
  );

----------------------------------------------------------------------
-- 3. Reescribir policies de reviews para el director
-- Scope: reviews cuyo sales_id pertenezca al equipo del director.
-- Las unmatched (sales_id IS NULL) NO las ve el director — son
-- responsabilidad del admin (verificación cruzada de location).
----------------------------------------------------------------------
drop policy if exists reviews_director_select on public.reviews;
drop policy if exists reviews_director_update on public.reviews;

create policy reviews_director_select on public.reviews
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and sales_id in (
      select id from public.profiles where director_id = auth.uid()
    )
  );

create policy reviews_director_update on public.reviews
  for update to authenticated
  using (
    public.current_role() = 'office_director'
    and sales_id in (
      select id from public.profiles where director_id = auth.uid()
    )
  )
  with check (
    public.current_role() = 'office_director'
    and sales_id in (
      select id from public.profiles where director_id = auth.uid()
    )
  );

----------------------------------------------------------------------
-- 4. Reescribir policies de clients y share_links
-- Mismo patrón: subquery sobre el equipo del director.
----------------------------------------------------------------------
drop policy if exists clients_director_select on public.clients;
drop policy if exists share_links_director_select on public.share_links;

create policy clients_director_select on public.clients
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and exists (
      select 1 from public.profiles p
      where p.id = clients.sales_id
        and p.director_id = auth.uid()
    )
  );

create policy share_links_director_select on public.share_links
  for select to authenticated
  using (
    public.current_role() = 'office_director'
    and sales_id in (
      select id from public.profiles where director_id = auth.uid()
    )
  );

----------------------------------------------------------------------
-- IMPORTANTE: las policies sobre `locations` (locations_director_select
-- y locations_director_update de la migración 012) NO se tocan — el
-- director sigue teniendo acceso a SU ficha por location_id. Su location
-- ya no determina qué sales ve, pero sí qué ficha gestiona.
--
-- El helper `current_office_location()` se mantiene.
-- `location_secrets` y `audit_log` siguen sin policies para director.
----------------------------------------------------------------------
