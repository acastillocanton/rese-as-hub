"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSafeNext } from "@/lib/url-validation";

const schema = z.object({
  email: z.string().email("Introduce un email válido."),
  next: z.string().nullable().optional(),
});

export async function sendMagicLink(formData: FormData) {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email inválido." };
  }

  const supabase = await createClient();
  const headerStore = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${headerStore.get("host") ?? "localhost:3000"}`;

  const next = isSafeNext(parsed.data.next) ? parsed.data.next! : "/";
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.error("[login] signInWithOtp failed:", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return { error: "No hemos podido enviar el correo. Inténtalo en un momento." };
  }

  return { ok: true };
}
