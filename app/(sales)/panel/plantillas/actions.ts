"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import type { MessageTemplateId, SavedTemplateEntry } from "@/lib/messaging";

const TEMPLATE_IDS: MessageTemplateId[] = ["post_visita", "reavivar", "breve"];

// Cada plantilla puede personalizar nombre y/o cuerpo. El cuerpo, si viene no
// vacío, debe contener {url} (si no, el mensaje no incluiría el enlace de reseña
// y no serviría). Campos en blanco → "sin personalizar", revierten a la base.
const oneTemplate = z
  .object({
    label: z.string().max(40, "El nombre no puede superar los 40 caracteres.").optional(),
    body: z
      .string()
      .max(1000, "El mensaje no puede superar los 1000 caracteres.")
      .refine((v) => v.trim() === "" || v.includes("{url}"), {
        message: "El mensaje debe incluir {url} (donde irá el enlace de reseña).",
      })
      .optional(),
  })
  .optional();

const saveSchema = z.object({
  post_visita: oneTemplate,
  reavivar: oneTemplate,
  breve: oneTemplate,
});

export type SaveTemplatesResult = { ok: true } | { ok: false; error: string };

export async function saveMessageTemplates(
  input: Partial<Record<MessageTemplateId, SavedTemplateEntry>>,
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

  // Construimos el objeto a guardar: solo campos con texto no vacío. Un campo
  // ausente revierte al valor base. Una entrada sin nombre ni cuerpo se omite;
  // si todas se omiten → NULL.
  const cleaned: Record<string, SavedTemplateEntry> = {};
  for (const id of TEMPLATE_IDS) {
    const entry = parsed.data[id];
    const label = entry?.label?.trim();
    const body = entry?.body?.trim();
    const out: SavedTemplateEntry = {};
    if (label) out.label = label;
    if (body) out.body = body;
    if (out.label || out.body) cleaned[id] = out;
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
  revalidatePath("/panel");
  revalidatePath("/clientes");
  return { ok: true };
}
