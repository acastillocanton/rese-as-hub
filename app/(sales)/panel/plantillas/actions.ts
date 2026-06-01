"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import type { MessageTemplateId } from "@/lib/messaging";

const TEMPLATE_IDS: MessageTemplateId[] = ["post_visita", "reavivar", "breve"];

// Cada plantilla es opcional. Si viene no vacía, debe contener {url} (si no, el
// mensaje no incluiría el enlace de reseña y la plantilla no serviría). Blanco
// → se trata como "sin personalizar" y revierte a la base de código.
const oneTemplate = z
  .string()
  .max(1000, "El mensaje no puede superar los 1000 caracteres.")
  .refine((v) => v.trim() === "" || v.includes("{url}"), {
    message: "El mensaje debe incluir {url} (donde irá el enlace de reseña).",
  });

const saveSchema = z.object({
  post_visita: oneTemplate.optional(),
  reavivar: oneTemplate.optional(),
  breve: oneTemplate.optional(),
});

export type SaveTemplatesResult = { ok: true } | { ok: false; error: string };

export async function saveMessageTemplates(
  input: Partial<Record<MessageTemplateId, string>>,
): Promise<SaveTemplatesResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  }

  // Construimos el objeto a guardar: solo claves con texto no vacío. Una clave
  // ausente revierte a la plantilla base. Si quedan todas vacías → NULL.
  const cleaned: Record<string, string> = {};
  for (const id of TEMPLATE_IDS) {
    const v = parsed.data[id]?.trim();
    if (v) cleaned[id] = v;
  }
  const payload = Object.keys(cleaned).length > 0 ? cleaned : null;

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ message_templates: payload })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await recordAudit({
    entityType: "profile",
    entityId: user.id,
    action: "update_message_templates",
    payload: { keys: Object.keys(cleaned) },
  });

  revalidatePath("/panel/plantillas");
  return { ok: true };
}
