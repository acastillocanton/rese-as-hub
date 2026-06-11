-- 027 · Alias de slug antiguo para productores (previous_slug)
--
-- Negocio pide que el slug público (/c/{slug}) lleve solo NOMBRE + PRIMER
-- APELLIDO. Los 33 productores con dos apellidos se renombran via script
-- one-shot (scripts/rename-producer-slugs.mjs, gitignored), que guarda el
-- slug viejo aquí. lib/landing.ts hace lookup de respaldo por previous_slug
-- para que los QRs impresos y los enlaces ya enviados por WhatsApp sigan
-- redirigiendo y ATRIBUYENDO la visita al mismo comercial (sin esto, el
-- enlace viejo caería en Google Maps genérico sin registrar nada).
--
-- Semántica:
--   • NULL  = nunca renombrado (caso normal).
--   • texto = slug anterior, sigue resolviendo en /c/{previous_slug}.
-- Solo guarda UN alias (si hubiera un segundo renombrado, se pisaría el más
-- viejo — aceptado, ver CLAUDE.md).

-- A · Columna + unicidad (parcial: solo filas con alias)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS previous_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_previous_slug_key
  ON profiles (previous_slug)
  WHERE previous_slug IS NOT NULL;

-- B · Congelar previous_slug en la auto-edición de perfil.
-- OBLIGATORIO (regla CLAUDE.md §4.36): si un sales pudiera auto-editarlo vía
-- PostgREST directo, podría poner el slug viejo de OTRO comercial y secuestrar
-- sus visitas/atribución. Reescribimos la policy completa (mig 021 + 022 +
-- 026) añadiendo la línea de previous_slug.
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
