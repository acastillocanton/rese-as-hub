-- Endurece la policy de auto-edición de perfil (profiles_self_update).
--
-- PROBLEMA (auditoría 2026-06-01): la policy original (mig 002) solo
-- comprobaba `id = auth.uid()` y que `role` no cambiara. NO restringía
-- columnas, así que cualquier usuario autenticado podía, llamando a PostgREST
-- directamente con el JWT de su sesión, modificar SU PROPIA fila:
--   commission_rate (fraude: el panel calcula € = counted × commission_rate),
--   monthly_goal, status (auto-reactivarse), location_id, director_id (moverse
--   de equipo/ficha). El gating de las server actions no protege esto porque
--   el atacante no pasa por la server action — va directo a la base de datos,
--   que es justo el borde que RLS debe defender.
--
-- FIX: congelamos las columnas sensibles en el WITH CHECK comparándolas contra
-- su valor actual (subconsulta). El único cambio de estado legítimo desde
-- contexto-usuario es el flip invited → active de /auth/confirm, que se permite
-- explícitamente. Las columnas no sensibles (full_name, phone, avatar_url,
-- language, department, notes, paused_reason, email) siguen siendo
-- auto-editables.
--
-- Esto NO afecta a admin/reviews_manager/office_director: sus UPDATE pasan por
-- sus propias policies permisivas (profiles_admin_all, profiles_manager_update_sales
-- mig 005, profiles_director_update_sales mig 013), que se evalúan en OR con esta.

drop policy if exists profiles_self_update on public.profiles;

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role           =            (select p.role           from public.profiles p where p.id = auth.uid())
    and slug           =            (select p.slug           from public.profiles p where p.id = auth.uid())
    and monthly_goal   =            (select p.monthly_goal   from public.profiles p where p.id = auth.uid())
    and commission_rate is not distinct from (select p.commission_rate from public.profiles p where p.id = auth.uid())
    and location_id     is not distinct from (select p.location_id     from public.profiles p where p.id = auth.uid())
    and director_id     is not distinct from (select p.director_id     from public.profiles p where p.id = auth.uid())
    and (
      status = (select p.status from public.profiles p where p.id = auth.uid())
      -- Excepción: primer login (flip invited → active en /auth/confirm).
      or (
        (select p.status from public.profiles p where p.id = auth.uid()) = 'invited'
        and status = 'active'
      )
    )
  );
