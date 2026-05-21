import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

type AuditInput = {
  entityType: "review" | "client" | "share_link" | "location" | "profile";
  entityId: string;
  action: string;
  payload?: Record<string, unknown>;
};

/**
 * audit_log tiene RLS habilitado y solo política de SELECT para admin: ningún
 * rol puede INSERT desde contexto-usuario. Por diseño — un comercial no
 * debería poder fabricar entradas. Por eso los inserts pasan por el
 * service-client (bypass RLS) desde código server-only.
 *
 * Errores no se propagan: el audit es traza secundaria; bloquear la acción
 * de negocio porque un INSERT a audit_log falle sería peor que perder la
 * traza. Se logea para diagnosticar.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const admin = createServiceClient();
    const { error } = await admin.from("audit_log").insert({
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      payload: input.payload ?? {},
    } as never);
    if (error) {
      console.error("[audit] insert failed:", error, input);
    }
  } catch (err) {
    console.error("[audit] threw:", err, input);
  }
}
