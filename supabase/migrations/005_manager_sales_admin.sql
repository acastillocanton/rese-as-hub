-- ReseñaHub — migration 005
-- Permitir al rol `reviews_manager` administrar comerciales (rol `sales`) con
-- el mismo nivel que el admin: invitar, editar (objetivo, ficha, estado),
-- reenviar acceso, eliminar. El manager NO puede tocar perfiles que no sean
-- de tipo `sales` ni escalar el rol de un sales a admin/manager.
--
-- Apply after 002_rls_policies.sql.

----------------------------------------------------------------------
-- profiles: nuevas políticas para reviews_manager limitadas a role='sales'
----------------------------------------------------------------------

-- INSERT: hoy el flujo de invitación va por service-role (lib/invite.ts), así
-- que esta política no se ejercita en producción. La añadimos por defensa en
-- profundidad y para que un futuro path con cookie-context tampoco escale.
-- with check evalúa la fila NUEVA — el manager solo puede crear filas con
-- role='sales'.
create policy profiles_manager_insert_sales on public.profiles
  for insert to authenticated
  with check (
    public.current_role() = 'reviews_manager'
    and role = 'sales'
  );

-- UPDATE: el manager puede modificar monthly_goal, location_id, status, etc.
-- de cualquier comercial. `using` filtra la fila ANTES (debe ser sales).
-- `with check` filtra la fila DESPUÉS (debe seguir siendo sales — el manager
-- no puede ascender un sales a admin/reviews_manager).
create policy profiles_manager_update_sales on public.profiles
  for update to authenticated
  using (
    public.current_role() = 'reviews_manager'
    and role = 'sales'
  )
  with check (
    public.current_role() = 'reviews_manager'
    and role = 'sales'
  );

-- DELETE: el manager puede eliminar comerciales. La acción servidor también
-- borra el auth.user vía service-role (deleteSales), eso ya pasa por
-- supabase.auth.admin.deleteUser y no toca RLS.
create policy profiles_manager_delete_sales on public.profiles
  for delete to authenticated
  using (
    public.current_role() = 'reviews_manager'
    and role = 'sales'
  );
