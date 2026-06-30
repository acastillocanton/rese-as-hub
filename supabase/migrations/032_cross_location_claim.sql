-- ReseñaHub — migration 032
-- Permitir al comercial MULTI-OFICINA (escrituradora, mig 031) ver y
-- "Reclamar" reseñas huérfanas en Verificación.
--
-- Problema: las policies de mig 016 (ver + reclamar huérfanas) están atadas a
-- `location_id = current_user_location()`, que para la escrituradora es NULL
-- (no tiene ficha fija). Por eso no veía ni podía reclamar ninguna huérfana.
--
-- Solución: un productor `cross_location` puede ver/reclamar huérfanas de
-- CUALQUIER ficha marcada como destino de escrituración
-- (`locations.escrituracion_target`), no solo de "su" ficha.
--
-- La garantía dura del claim NO cambia: el WITH CHECK sigue exigiendo que la
-- fila quede con sales_id = auth.uid() y match_state='counted'. Solo se abre
-- el conjunto de fichas sobre el que puede operar.

-- Helper: ¿el usuario actual es un productor multi-oficina?
create or replace function public.is_cross_location_producer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select cross_location from public.profiles where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_cross_location_producer() to authenticated;

-- B (reescrita) · SELECT de huérfanas: ficha propia O —si es multi-oficina—
-- cualquier ficha de escrituración.
drop policy if exists reviews_unmatched_location_select on public.reviews;
create policy reviews_unmatched_location_select on public.reviews
  for select
  to authenticated
  using (
    sales_id is null
    and removed_at is null
    and public.current_role() in ('sales','office_director')
    and (
      location_id = public.current_user_location()
      or (
        public.is_cross_location_producer()
        and location_id in (
          select id from public.locations where escrituracion_target
        )
      )
    )
  );

-- C (reescrita) · UPDATE "Reclamar": mismas garantías que mig 016, con el
-- conjunto de fichas ampliado para el productor multi-oficina.
drop policy if exists reviews_sales_claim_update on public.reviews;
create policy reviews_sales_claim_update on public.reviews
  for update
  to authenticated
  using (
    public.current_role() = 'sales'
    and sales_id is null
    and removed_at is null
    and (
      location_id = public.current_user_location()
      or (
        public.is_cross_location_producer()
        and location_id in (
          select id from public.locations where escrituracion_target
        )
      )
    )
  )
  with check (
    public.current_role() = 'sales'
    and sales_id = auth.uid()
    and match_state = 'counted'
    and removed_at is null
    and (
      location_id = public.current_user_location()
      or (
        public.is_cross_location_producer()
        and location_id in (
          select id from public.locations where escrituracion_target
        )
      )
    )
  );
