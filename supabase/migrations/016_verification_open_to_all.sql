-- 016 · Abrir /resenas/verificacion a todos los roles
--
-- Contexto: hoy la sección de verificación es accesible solo a admin y
-- office_director. La realidad operativa es que quien mejor identifica
-- una reseña huérfana (la que dejó un cliente sin pasar por el enlace
-- personal /c/{sales}/{client}) es el propio comercial o su director de
-- oficina — son los que conocen al cliente por nombre.
--
-- Decisión de producto:
--   • sales + office_director ven huérfanas (sales_id IS NULL) SOLO de
--     SU location (profiles.location_id).
--   • sales puede únicamente "Reclamar": unmatched → counted con
--     sales_id = self. Nada más.
--   • office_director ya tiene UPDATE sobre reviews de su equipo (mig 013).
--     Esta migración añade visibilidad sobre las huérfanas de su location.
--   • reviews_manager y admin no cambian.
--
-- Tres bloques idempotentes:
--   A) Helper SQL current_user_location() (location_id del auth.uid()).
--   B) Policy SELECT permissive sobre reviews para sales + director sobre
--      las unmatched de su location.
--   C) Policy UPDATE estricta para que sales pueda "Reclamar" (unmatched
--      → counted con sales_id = auth.uid()).

-- A · Helper genérico location del usuario actual
-- Devuelve location_id del profile del auth.uid(). Para admin/manager es
-- NULL (no aplica las policies que la usan). Para sales/director siempre
-- non-null por constraint role_requires_location (mig 011).
create or replace function public.current_user_location()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select location_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_location() to authenticated;

-- B · Policy SELECT: sales + director ven huérfanas de su location.
-- Asimetría intencional vs mig 013 (que limita al director a su equipo y
-- dejaba las unmatched fuera de su vista): aquí abrimos las huérfanas
-- explícitamente porque son lo que el sales/director debe identificar.
drop policy if exists reviews_unmatched_location_select on public.reviews;
create policy reviews_unmatched_location_select on public.reviews
  for select
  to authenticated
  using (
    sales_id is null
    and removed_at is null
    and location_id = public.current_user_location()
    and public.current_role() in ('sales','office_director')
  );

-- C · Policy UPDATE para "Reclamar". Estricta:
--   USING: solo unmatched, no eliminadas, de mi location, rol sales.
--   WITH CHECK: la fila resultante TIENE que quedar con sales_id =
--   auth.uid() y match_state='counted'. Imposible que un sales reasigne
--   a otro o desatribuya por aquí.
drop policy if exists reviews_sales_claim_update on public.reviews;
create policy reviews_sales_claim_update on public.reviews
  for update
  to authenticated
  using (
    public.current_role() = 'sales'
    and sales_id is null
    and removed_at is null
    and location_id = public.current_user_location()
  )
  with check (
    public.current_role() = 'sales'
    and sales_id = auth.uid()
    and match_state = 'counted'
    and removed_at is null
    and location_id = public.current_user_location()
  );

-- Notas:
--   • clients_sales_own (mig 002) ya permite a sales INSERT con
--     sales_id = auth.uid() → "+ Nuevo cliente" inline funciona sin tocar
--     más policies.
--   • audit_log_self_insert (mig 008) ya admite inserts con
--     actor_id = auth.uid(). El helper recordAudit() sigue usando
--     service-role para coherencia con el resto de la app.
