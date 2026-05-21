"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

const createClientSchema = z.object({
  fullName: z.string().min(2, "Nombre demasiado corto.").max(120),
  phone: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  email: z
    .string()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: "Email inválido.",
    }),
});

export type CreateClientInput = z.input<typeof createClientSchema>;

export type ClientRow = {
  id: string;
  full_name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export async function createClientRecord(
  input: CreateClientInput,
): Promise<{ ok: true; client: ClientRow } | { ok: false; error: string }> {
  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "No autenticado." };
  }

  const baseSlug = slugify(parsed.data.fullName);
  if (!baseSlug) {
    return { ok: false, error: "No se pudo generar el identificador del cliente." };
  }

  // (sales_id, slug) is UNIQUE — derive a free suffix when the base collides.
  const { data: existing } = await supabase
    .from("clients")
    .select("slug")
    .eq("sales_id", user.id)
    .like("slug", `${baseSlug}%`)
    .returns<{ slug: string }[]>();

  const taken = new Set((existing ?? []).map((c) => c.slug));
  let slug = baseSlug;
  let n = 2;
  while (taken.has(slug)) {
    slug = `${baseSlug}-${n++}`;
    if (n > 999) {
      return { ok: false, error: "Demasiados clientes con ese nombre." };
    }
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      sales_id: user.id,
      full_name: parsed.data.fullName.trim(),
      slug,
      email: parsed.data.email,
      phone: parsed.data.phone,
    } as never)
    .select("id, full_name, slug, email, phone, created_at")
    .single<ClientRow>();

  if (error || !data) {
    console.error("[clientes] createClient failed:", error);
    return { ok: false, error: error?.message ?? "No se pudo crear el cliente." };
  }

  revalidatePath("/clientes");
  return { ok: true, client: data };
}

export async function deleteClientRecord(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Id inválido." };

  const supabase = await createClient();
  // RLS (`clients_sales_own`) enforces that the caller can only delete their
  // own clients. share_links + reviews FKs are ON DELETE SET NULL, so history
  // survives the deletion.
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) {
    console.error("[clientes] deleteClient failed:", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/clientes");
  return { ok: true };
}
