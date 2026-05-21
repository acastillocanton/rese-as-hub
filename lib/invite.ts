import "server-only";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

type CreateInvitedProfileArgs = {
  fullName: string;
  email: string;
  phone: string | null;
  slug: string;
  role: "sales" | "reviews_manager";
  /** Campos extra del profile específicos del rol (location_id, monthly_goal, …). */
  extra: Record<string, unknown>;
  /** Path al que se redirige al usuario tras aceptar el invite. */
  nextPath: string;
  /** Path(s) a revalidar tras crear el profile, para refrescar listados. */
  revalidate: string[];
};

/**
 * Genera invite-link de Supabase + inserta la fila en profiles. Helper
 * común a sales y reviews_manager — la única diferencia es el rol, los
 * campos extra del profile y la ruta a la que redirigimos tras el primer
 * login.
 *
 * No se envía email; devolvemos el link al admin para que lo comparta.
 * El link apunta a /auth/confirm (verifyOtp server-side) en lugar del
 * action_link nativo de Supabase porque el verifier-en-cookies del flujo
 * PKCE rompía cuando el invitado abría el link desde otro dispositivo.
 */
export async function createInvitedProfile(
  args: CreateInvitedProfileArgs,
): Promise<
  | { ok: true; inviteLink: string; email: string }
  | { ok: false; error: string }
> {
  const admin = createServiceClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("slug", args.slug)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      error: `Ya existe un perfil con el slug "${args.slug}". Cambia el nombre o añade un apellido.`,
    };
  }

  const headerStore = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${headerStore.get("host") ?? "localhost:3000"}`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: args.email,
    options: {
      data: { full_name: args.fullName },
    },
  });

  if (linkError || !linkData?.user?.id || !linkData?.properties?.hashed_token) {
    console.error("[invite] generateLink failed:", linkError);
    if (linkError?.code === "email_exists") {
      return { ok: false, error: "Este email ya está registrado." };
    }
    return { ok: false, error: linkError?.message ?? "No se pudo crear la invitación." };
  }

  const newUserId = linkData.user.id;
  const inviteLink = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    linkData.properties.hashed_token,
  )}&type=invite&next=${encodeURIComponent(args.nextPath)}`;

  const { error: profileError } = await admin.from("profiles").insert({
    id: newUserId,
    full_name: args.fullName.trim(),
    role: args.role,
    slug: args.slug,
    email: args.email,
    phone: args.phone,
    status: "invited",
    ...args.extra,
  } as never);

  if (profileError) {
    // Roll back the auth user so we don't leave it orphaned.
    await admin.auth.admin.deleteUser(newUserId);
    console.error("[invite] profile insert failed:", profileError);
    return { ok: false, error: profileError.message };
  }

  for (const path of args.revalidate) {
    revalidatePath(path);
  }
  return { ok: true, inviteLink, email: args.email };
}
