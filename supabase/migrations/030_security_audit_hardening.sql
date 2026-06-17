-- 030_security_audit_hardening.sql
-- Endurecimiento de la integridad del audit_log (auditoría de seguridad 2026-06-17).
--
-- Dos cambios independientes, ambos sobre la integridad de la traza:
--
-- 1) QUITAR `audit_log_self_insert` (de mig 008). Esa policy permitía a CUALQUIER
--    usuario autenticado insertar filas en audit_log con `actor_id = auth.uid()`,
--    sin restringir entity_type/action/payload → un comercial podía FABRICAR
--    entradas de auditoría a su nombre (action='confirm', etc.) y ensuciar la
--    traza forense. La app NUNCA usa ese camino: `recordAudit()` (lib/audit.ts)
--    escribe SIEMPRE vía service-client (bypassa RLS). Por tanto quitar la policy
--    no rompe nada y devuelve audit_log a "solo escritura por service-role".
--
-- 2) TRIGGER de auditoría sobre cambios de tarifa/tope de comisión en `profiles`.
--    Las policies UPDATE de gestor/director (mig 005/013) no congelan columnas,
--    así que un gestor/director podría cambiar `commission_rate`/`commission_cap`
--    de un comercial por PostgREST directo, SIN pasar por la server action que
--    registra el audit → mutación financiera sin rastro. Este trigger registra el
--    cambio a nivel de BD pase por donde pase (app o PATCH directo). En el camino
--    legítimo (updateSales con cookie-client) `auth.uid()` identifica al actor.

-- 1) Revertir audit_log a solo-service-role para INSERT.
drop policy if exists audit_log_self_insert on audit_log;

-- 2) Trigger de traza para cambios de comisión.
create or replace function audit_commission_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.commission_rate is distinct from old.commission_rate)
     or (new.commission_cap is distinct from old.commission_cap) then
    begin
      insert into audit_log (entity_type, entity_id, action, actor_id, payload)
      values (
        'profile',
        new.id,
        'commission_change_db',
        auth.uid(),
        jsonb_build_object(
          'old_rate', old.commission_rate,
          'new_rate', new.commission_rate,
          'old_cap',  old.commission_cap,
          'new_cap',  new.commission_cap
        )
      );
    exception when others then
      -- La traza es secundaria: si el insert fallara, NUNCA bloquear el UPDATE
      -- de negocio (mismo principio que recordAudit en lib/audit.ts).
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_commission on profiles;
create trigger trg_audit_commission
  after update of commission_rate, commission_cap on profiles
  for each row
  execute function audit_commission_change();
