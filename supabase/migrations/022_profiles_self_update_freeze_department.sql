-- Addendum a la mig 021: congela también `department` y `language` en la
-- auto-edición de perfil.
--
-- La 021 congeló role/slug/monthly_goal/commission_rate/location_id/director_id/
-- status, pero dejó `department` y `language` auto-editables. No hay UI de sales
-- que los edite, pero por PostgREST directo un comercial podía cambiarse el
-- `department` — que es la dimensión que enruta a cada productor a su hoja del
-- Excel oficial (parte semanal). Son atributos de clasificación (RRHH), no
-- campos self-service. Los congelamos con el mismo patrón `is not distinct from`.
--
-- Siguen auto-editables: full_name, phone, avatar_url, notes, paused_reason,
-- email. No afecta a admin/manager/director (sus policies permisivas van en OR).

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
