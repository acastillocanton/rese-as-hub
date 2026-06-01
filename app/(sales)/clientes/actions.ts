"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import {
  scoreOrphanCandidates,
  type OrphanReviewCandidate,
  type OrphanReviewInput,
} from "@/lib/clients/orphan-reviews";
import { decideDuplicateForClient } from "@/lib/cron/duplicate-detection";
import type { Role } from "@/lib/supabase/types";

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

  // OJO: NO revalidamos /clientes aquí. La revalidación re-renderiza la página y,
  // al crear el PRIMER cliente, conmuta el empty-state por la tabla — eso desmonta
  // el NewClientButton (que vive dentro del empty-state) junto con el diálogo de
  // compartir que se acaba de abrir, y el diálogo se cerraba solo (bug).
  // El refresco de la lista lo dispara NewClientButton con router.refresh() al
  // CERRAR el diálogo (cuando el comercial ya terminó). `claimReview`, que también
  // usa esta acción, revalida /clientes por su cuenta — no depende de aquí.
  return { ok: true, client: data };
}

const updateSchema = z.object({
  id: z.string().uuid(),
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

export type UpdateClientInput = z.input<typeof updateSchema>;

export async function updateClientRecord(
  input: UpdateClientInput,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  // Solo cambiamos los campos editables. El slug NO cambia aunque cambie el
  // nombre — si cambiase, romperíamos enlaces ya compartidos. La spec dice
  // que el slug es estable tras la creación.
  const { data, error } = await supabase
    .from("clients")
    .update({
      full_name: parsed.data.fullName.trim(),
      email: parsed.data.email,
      phone: parsed.data.phone,
    } as never)
    .eq("id", parsed.data.id)
    .eq("sales_id", user.id) // RLS también lo gatea, esto es defensa en profundidad
    .select("slug")
    .single<{ slug: string }>();

  if (error || !data) {
    console.error("[clientes] updateClient failed:", error);
    return { ok: false, error: error?.message ?? "No se pudo actualizar el cliente." };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${data.slug}`);
  return { ok: true, slug: data.slug };
}

export async function deleteClientRecord(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Id inválido." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  // Snapshot del cliente antes de borrar — share_links + reviews quedan con
  // client_id=null por ON DELETE SET NULL, así que sin esto perdemos la traza.
  const { data: snapshot } = await supabase
    .from("clients")
    .select("id, full_name, slug, email, phone, sales_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      full_name: string;
      slug: string;
      email: string | null;
      phone: string | null;
      sales_id: string;
    }>();

  // RLS (`clients_sales_own`) enforces that the caller can only delete their
  // own clients.
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) {
    console.error("[clientes] deleteClient failed:", error);
    return { ok: false, error: error.message };
  }

  if (snapshot) {
    await recordAudit({
      entityType: "client",
      entityId: snapshot.id,
      action: "delete",
      payload: {
        deleted_by: user.id,
        full_name: snapshot.full_name,
        slug: snapshot.slug,
        email: snapshot.email,
        phone: snapshot.phone,
        sales_id: snapshot.sales_id,
      },
    });
  }

  revalidatePath("/clientes");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sugerencia de vinculación de reseñas huérfanas tras crear cliente.
//
// Caso típico: el cliente deja la reseña ANTES de que el comercial le dé de
// alta en su CRM. El matcher la deja unmatched (no hay share_link), un
// humano la reclama al sales sin asignar cliente. Cuando se crea el cliente
// posteriormente, detectamos reseñas counted del sales con client_id=null y
// autor similar al nombre del cliente, y se las ofrecemos para vincular.
// Ver lib/clients/orphan-reviews.ts (helper puro testeado).
// ─────────────────────────────────────────────────────────────────────────────

type FindOrphanScope = { userId: string; role: Role; client: ClientLookup };
type ClientLookup = { id: string; full_name: string; sales_id: string };

/**
 * Auth común para find/link. Resuelve el actor, lee el cliente y verifica
 * que el caller tiene scope sobre él.
 */
async function resolveOrphanScope(
  clientId: string,
): Promise<{ ok: true; scope: FindOrphanScope } | { ok: false; error: string }> {
  const parsed = z.string().uuid().safeParse(clientId);
  if (!parsed.success) return { ok: false, error: "Id de cliente inválido." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const { data: actor } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: Role }>();
  if (!actor) return { ok: false, error: "No autenticado." };

  const admin = createServiceClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, full_name, sales_id")
    .eq("id", parsed.data)
    .maybeSingle<ClientLookup>();
  if (!client) return { ok: false, error: "Cliente no encontrado." };

  // Auth por scope:
  //   • sales → dueño del cliente.
  //   • office_director → el dueño del cliente debe estar en su equipo
  //     (director_id = user.id) o ser él mismo.
  //   • admin / reviews_manager → cualquiera.
  if (actor.role === "sales") {
    if (client.sales_id !== user.id) {
      return { ok: false, error: "No autorizado." };
    }
  } else if (actor.role === "office_director") {
    if (client.sales_id !== user.id) {
      const { data: teamMember } = await admin
        .from("profiles")
        .select("id")
        .eq("id", client.sales_id)
        .eq("director_id", user.id)
        .maybeSingle<{ id: string }>();
      if (!teamMember) return { ok: false, error: "No autorizado." };
    }
  } else if (actor.role !== "admin" && actor.role !== "reviews_manager") {
    return { ok: false, error: "No autorizado." };
  }

  return { ok: true, scope: { userId: user.id, role: actor.role, client } };
}

/**
 * Busca reseñas counted del mismo sales sin client_id que se parezcan en
 * nombre al cliente recién creado, y devuelve hasta 5 ordenadas por
 * similarity desc. Si la lista está vacía, el caller no debe mostrar el
 * modal de sugerencias.
 */
export async function findOrphanReviewsForClient(
  clientId: string,
): Promise<
  | { ok: true; candidates: OrphanReviewCandidate[] }
  | { ok: false; error: string }
> {
  const res = await resolveOrphanScope(clientId);
  if (!res.ok) return { ok: false, error: res.error };
  const { scope } = res;

  // Service-client para leer las reseñas del sales. La RLS de reviews
  // limita a sales lo que ve a su sales_id (lo que justamente queremos),
  // pero el caller puede ser admin/manager/director sin esa restricción
  // — homogeneizamos con service.
  const admin = createServiceClient();
  const { data: orphans, error } = await admin
    .from("reviews")
    .select("id, author_name, rating, google_created_at")
    .eq("sales_id", scope.client.sales_id)
    .eq("match_state", "counted")
    .is("client_id", null)
    .is("removed_at", null)
    .order("google_created_at", { ascending: false })
    .limit(50)
    .returns<OrphanReviewInput[]>();
  if (error) {
    console.error("[clientes] findOrphan query failed:", error);
    return { ok: false, error: "No se pudieron buscar candidatas." };
  }

  const candidates = scoreOrphanCandidates(scope.client.full_name, orphans ?? []);
  return { ok: true, candidates };
}

const linkSchema = z.object({
  reviewId: z.string().uuid(),
  clientId: z.string().uuid(),
});

/**
 * Vincula una reseña huérfana (counted del sales, client_id null) al
 * cliente. Aplica anti-fraude (mig 015): si el cliente ya tiene una
 * principal, la nueva entra como duplicada; si la nueva es más antigua,
 * demota la principal previa.
 *
 * Race-safe: el UPDATE incluye `.is("client_id", null)` en el WHERE — si
 * otro actor la vinculó entre la lectura y la escritura, matchea 0
 * filas y devolvemos error UX.
 */
export async function linkOrphanReviewToClient(
  input: z.input<typeof linkSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const res = await resolveOrphanScope(parsed.data.clientId);
  if (!res.ok) return { ok: false, error: res.error };
  const { scope } = res;

  // Cargar la reseña: debe pertenecer al mismo sales, estar counted, sin
  // cliente y no removed. Lookup con service-client por consistencia.
  const admin = createServiceClient();
  const { data: review } = await admin
    .from("reviews")
    .select("id, sales_id, match_state, client_id, removed_at, google_created_at")
    .eq("id", parsed.data.reviewId)
    .maybeSingle<{
      id: string;
      sales_id: string | null;
      match_state: string;
      client_id: string | null;
      removed_at: string | null;
      google_created_at: string;
    }>();
  if (!review) return { ok: false, error: "Reseña no encontrada." };
  if (review.removed_at) {
    return { ok: false, error: "La reseña está marcada como eliminada." };
  }
  if (review.match_state !== "counted") {
    return { ok: false, error: "La reseña no está atribuida." };
  }
  if (review.client_id) {
    return { ok: false, error: "La reseña ya tiene cliente asignado." };
  }
  if (review.sales_id !== scope.client.sales_id) {
    return { ok: false, error: "La reseña no es del mismo comercial." };
  }

  // Anti-fraude mig 015: ¿hay otra principal del mismo client_id?
  const dup = await decideDuplicateForClient(admin, {
    clientId: parsed.data.clientId,
    incomingGoogleCreatedAt: review.google_created_at,
    excludeReviewId: review.id,
  });

  // UPDATE con doble candado (where client_id is null) para race-safety.
  const { data: updated, error: upErr } = await admin
    .from("reviews")
    .update({
      client_id: parsed.data.clientId,
      is_duplicate: dup.newIsDuplicate,
    } as never)
    .eq("id", review.id)
    .is("client_id", null)
    .is("removed_at", null)
    .select("id");
  if (upErr) {
    console.error("[clientes] linkOrphan update failed:", upErr);
    return { ok: false, error: upErr.message };
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "La reseña fue modificada por otro usuario. Vuelve a cargar.",
    };
  }

  if (dup.demotedReviewId) {
    await admin
      .from("reviews")
      .update({ is_duplicate: true } as never)
      .eq("id", dup.demotedReviewId);
  }

  await recordAudit({
    entityType: "review",
    entityId: review.id,
    action: "link_orphan",
    payload: {
      linked_by: scope.userId,
      actor_role: scope.role,
      client_id: parsed.data.clientId,
      is_duplicate: dup.newIsDuplicate,
      demoted_review_id: dup.demotedReviewId,
    },
  });

  revalidatePath("/clientes");
  revalidatePath("/panel/resenas");
  revalidatePath("/dashboard");
  revalidatePath("/manager/resenas");
  return { ok: true };
}
