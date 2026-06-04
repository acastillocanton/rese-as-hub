"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAudit } from "@/lib/audit";
import {
  notifySupportMessage,
  resolveSupportRecipients,
} from "@/lib/email/notify-support";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import type { Role, SupportCategory } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CATEGORIES: SupportCategory[] = [
  "general",
  "review_question",
  "technical",
  "billing",
];

const createConversationSchema = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(1).max(5000),
  category: z.enum(CATEGORIES as [SupportCategory, ...SupportCategory[]]).default("general"),
  linkedReviewId: z.string().uuid().nullable().optional(),
  linkedClientId: z.string().uuid().nullable().optional(),
});

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});

const conversationIdSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CurrentUser = { id: string; role: Role; fullName: string; email: string | null };

async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .maybeSingle<{ role: Role; full_name: string; email: string | null }>();
  if (!data) return null;
  return { id: user.id, role: data.role, fullName: data.full_name, email: data.email };
}

/** Fetch active admin + reviews_manager emails for notification. */
async function getResponderEmails(): Promise<string[]> {
  const srv = createServiceClient();
  const { data } = await srv
    .from("profiles")
    .select("email")
    .in("role", ["admin", "reviews_manager"])
    .eq("status", "active");
  if (!data) return [];
  return data.map((r) => r.email).filter((e): e is string => !!e);
}

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://resenas.marinadorconstrucciones.com";
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type CreateConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

export async function createConversation(
  input: z.infer<typeof createConversationSchema>,
): Promise<CreateConversationResult> {
  const parsed = createConversationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const supabase = await createClient();

  // Create conversation via cookie-client (RLS enforces opener_id = self)
  const { data: conv, error: convErr } = await supabase
    .from("support_conversations")
    .insert({
      subject: parsed.data.subject,
      category: parsed.data.category,
      opener_id: user.id,
      linked_review_id: parsed.data.linkedReviewId ?? null,
      linked_client_id: parsed.data.linkedClientId ?? null,
    } as never)
    .select("id")
    .single();

  if (convErr || !conv) {
    console.error("[support] create conversation failed:", convErr);
    return { ok: false, error: "Error al crear la consulta." };
  }

  const convId = (conv as { id: string }).id;

  // Insert first message
  const { error: msgErr } = await supabase.from("support_messages").insert({
    conversation_id: convId,
    author_id: user.id,
    body: parsed.data.body,
  } as never);

  if (msgErr) {
    console.error("[support] create first message failed:", msgErr);
    // Conversation exists but message failed — still return the id
  }

  // Mark as read for the opener
  await supabase.from("support_read_receipts").upsert(
    { user_id: user.id, conversation_id: convId, last_read_at: new Date().toISOString() } as never,
    { onConflict: "user_id,conversation_id" },
  );

  await recordAudit({
    entityType: "conversation",
    entityId: convId,
    action: "conversation_created",
    payload: { category: parsed.data.category, opener: user.id },
  });

  // Send email notification to responders (fire-and-forget)
  const brand = await getCurrentUserBrand();
  const responderEmails = await getResponderEmails();
  notifySupportMessage({
    conversationId: convId,
    subject: parsed.data.subject,
    messagePreview: parsed.data.body.slice(0, 500),
    authorName: user.fullName,
    isFromOpener: true,
    openerEmail: user.email ?? "",
    responderEmails,
    appBase: appBase(),
    brand,
  }).catch((err) => console.error("[support] notify failed:", err));

  revalidatePath("/soporte");
  return { ok: true, conversationId: convId };
}

export type SendMessageResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendMessage(
  input: z.infer<typeof sendMessageSchema>,
): Promise<SendMessageResult> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const supabase = await createClient();

  // Insert message via cookie-client (RLS checks conversation visibility)
  const { error: msgErr } = await supabase.from("support_messages").insert({
    conversation_id: parsed.data.conversationId,
    author_id: user.id,
    body: parsed.data.body,
  } as never);

  if (msgErr) {
    console.error("[support] send message failed:", msgErr);
    return { ok: false, error: "Error al enviar el mensaje." };
  }

  // Update last_message_at via service-client (the message author may not have
  // UPDATE permission on conversations via RLS — e.g. a responder replying)
  const srv = createServiceClient();
  await srv
    .from("support_conversations")
    .update({ last_message_at: new Date().toISOString() } as never)
    .eq("id", parsed.data.conversationId);

  // Mark as read for the sender
  await supabase.from("support_read_receipts").upsert(
    {
      user_id: user.id,
      conversation_id: parsed.data.conversationId,
      last_read_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id,conversation_id" },
  );

  await recordAudit({
    entityType: "conversation",
    entityId: parsed.data.conversationId,
    action: "message_sent",
    payload: { author: user.id },
  });

  // Determine if this is from the opener or a responder, and notify accordingly
  const { data: convData } = await srv
    .from("support_conversations")
    .select("opener_id, subject")
    .eq("id", parsed.data.conversationId)
    .single();

  if (convData) {
    const opener = convData as { opener_id: string; subject: string };
    const isFromOpener = opener.opener_id === user.id;

    // Get opener email
    let openerEmail = "";
    if (!isFromOpener) {
      const { data: openerProfile } = await srv
        .from("profiles")
        .select("email")
        .eq("id", opener.opener_id)
        .single();
      openerEmail = (openerProfile as { email: string | null } | null)?.email ?? "";
    } else {
      openerEmail = user.email ?? "";
    }

    const brand = await getCurrentUserBrand();
    const responderEmails = await getResponderEmails();

    notifySupportMessage({
      conversationId: parsed.data.conversationId,
      subject: opener.subject,
      messagePreview: parsed.data.body.slice(0, 500),
      authorName: user.fullName,
      isFromOpener,
      openerEmail,
      responderEmails,
      appBase: appBase(),
      brand,
    }).catch((err) => console.error("[support] notify failed:", err));
  }

  revalidatePath(`/soporte/${parsed.data.conversationId}`);
  revalidatePath("/soporte");
  return { ok: true };
}

export type CloseConversationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function closeConversation(
  conversationId: string,
): Promise<CloseConversationResult> {
  const id = conversationIdSchema.safeParse(conversationId);
  if (!id.success) return { ok: false, error: "ID inválido." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No autenticado." };

  // Admin/manager can close any; opener can close their own. RLS handles scope.
  const supabase = await createClient();
  const isResponder = user.role === "admin" || user.role === "reviews_manager";

  if (isResponder) {
    // Use service-client for responders (they have full RLS but UPDATE with
    // status change needs to bypass the opener-only check for sales/director)
    const srv = createServiceClient();
    const { error } = await srv
      .from("support_conversations")
      .update({ status: "closed", closed_at: new Date().toISOString() } as never)
      .eq("id", id.data);
    if (error) return { ok: false, error: "Error al cerrar." };
  } else {
    // Opener closes their own — cookie-client, RLS enforces opener_id = self
    const { error } = await supabase
      .from("support_conversations")
      .update({ status: "closed", closed_at: new Date().toISOString() } as never)
      .eq("id", id.data);
    if (error) return { ok: false, error: "Error al cerrar." };
  }

  await recordAudit({
    entityType: "conversation",
    entityId: id.data,
    action: "conversation_closed",
    payload: { closedBy: user.id },
  });

  revalidatePath(`/soporte/${id.data}`);
  revalidatePath("/soporte");
  return { ok: true };
}

export async function reopenConversation(
  conversationId: string,
): Promise<CloseConversationResult> {
  const id = conversationIdSchema.safeParse(conversationId);
  if (!id.success) return { ok: false, error: "ID inválido." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const isResponder = user.role === "admin" || user.role === "reviews_manager";

  if (isResponder) {
    const srv = createServiceClient();
    const { error } = await srv
      .from("support_conversations")
      .update({ status: "open", closed_at: null } as never)
      .eq("id", id.data);
    if (error) return { ok: false, error: "Error al reabrir." };
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("support_conversations")
      .update({ status: "open", closed_at: null } as never)
      .eq("id", id.data);
    if (error) return { ok: false, error: "Error al reabrir." };
  }

  await recordAudit({
    entityType: "conversation",
    entityId: id.data,
    action: "conversation_reopened",
    payload: { reopenedBy: user.id },
  });

  revalidatePath(`/soporte/${id.data}`);
  revalidatePath("/soporte");
  return { ok: true };
}

export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  const id = conversationIdSchema.safeParse(conversationId);
  if (!id.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("support_read_receipts").upsert(
    {
      user_id: user.id,
      conversation_id: id.data,
      last_read_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id,conversation_id" },
  );

  revalidatePath("/soporte");
}
