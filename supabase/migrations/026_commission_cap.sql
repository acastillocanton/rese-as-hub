-- 026 · Tope de reseñas BONIFICABLES por productor (commission_cap)
--
-- Cambio de política de dirección: a cada comercial/director productor se le
-- paga comisión por un MÁXIMO de N reseñas por periodo de comisión (20→19),
-- default 5. El comercial puede seguir consiguiendo más reseñas (cuentan para
-- producción, ranking, insignias e historial), pero el importe € solo se
-- calcula sobre min(counted, commission_cap).
--
-- Concepto DISTINTO de `monthly_goal` (que es "lo que se le exige", objetivo
-- aspiracional). Aquí definimos "cuántas reseñas son bonificables".
--
-- Semántica de la columna:
--   • NULL  = sin tope (ilimitado, paga todas las counted). Escape-hatch para
--             dejar a alguien exento; también el comportamiento legacy.
--   • int N = tope de reseñas bonificables por periodo.
-- Default 5 + backfill de los productores existentes a 5 (aplica la política
-- nueva a todos). admin/reviews_manager no son productores; el valor que
-- tengan es inerte (no se muestra ni se usa para ellos).

-- A · Columna + backfill
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS commission_cap int DEFAULT 5;

UPDATE profiles
  SET commission_cap = 5
  WHERE role IN ('sales', 'office_director')
    AND commission_cap IS NULL;

-- B · Congelar commission_cap en la auto-edición de perfil.
-- OBLIGATORIO (regla CLAUDE.md §4.36): toda columna financiera/sensible nueva
-- en profiles debe congelarse en profiles_self_update en su misma migración.
-- Sin esto, un sales podría subirse el tope por PostgREST directo (el gating
-- de las server actions no protege el borde de BD). Reescribimos la policy
-- completa (mig 021 + 022) añadiendo la línea de commission_cap.
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
    and commission_cap  is not distinct from (select p.commission_cap  from public.profiles p where p.id = auth.uid())
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
