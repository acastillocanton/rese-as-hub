import { redirect, notFound } from "next/navigation";
import { Star, ExternalLink } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { MessageBubble } from "@/components/soporte/MessageBubble";
import { MessageComposer } from "@/components/soporte/MessageComposer";
import { ConversationActions } from "@/components/soporte/ConversationActions";
import { CategoryPill } from "@/components/soporte/CategoryPill";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { markConversationRead } from "@/app/(profile)/soporte/actions";
import { buildGoogleReviewListUrl } from "@/lib/google/review-url";
import type { Role, SupportCategory, SupportStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConversationDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return <div style={{ padding: 32 }}>Supabase no configurado.</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: Role }>();

  const role = profile?.role ?? "sales";
  const isResponder = role === "admin" || role === "reviews_manager";

  type ConvDetail = {
    id: string;
    subject: string;
    category: string;
    status: string;
    opener_id: string;
    linked_review_id: string | null;
    linked_client_id: string | null;
    created_at: string;
    closed_at: string | null;
  };
  type MsgRow = { id: string; author_id: string; body: string; created_at: string };
  type AuthorRow = { id: string; full_name: string; avatar_url: string | null; role: string };
  type ReviewLinkRow = { author_name: string; rating: number; google_created_at: string; location_id: string };

  // Fetch conversation (RLS scopes)
  const { data: conv } = await supabase
    .from("support_conversations")
    .select("id, subject, category, status, opener_id, linked_review_id, linked_client_id, created_at, closed_at")
    .eq("id", id)
    .returns<ConvDetail[]>()
    .maybeSingle();

  if (!conv) notFound();

  const conversation = {
    ...conv,
    category: conv.category as SupportCategory,
    status: conv.status as SupportStatus,
  };

  // Fetch messages
  const { data: messages } = await supabase
    .from("support_messages")
    .select("id, author_id, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<MsgRow[]>();

  // Fetch author profiles
  const authorIds = [...new Set((messages ?? []).map((m) => m.author_id))];
  if (!authorIds.includes(conversation.opener_id)) authorIds.push(conversation.opener_id);
  let authorMap = new Map<string, { full_name: string; avatar_url: string | null; role: Role }>();
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .in("id", authorIds)
      .returns<AuthorRow[]>();
    if (authors) {
      authorMap = new Map(
        authors.map((a) => [
          a.id,
          { full_name: a.full_name, avatar_url: a.avatar_url, role: a.role as Role },
        ]),
      );
    }
  }

  // Fetch linked review context
  let linkedReview: {
    author_name: string;
    rating: number;
    google_created_at: string;
    place_id: string | null;
  } | null = null;
  if (conversation.linked_review_id) {
    const { data } = await supabase
      .from("reviews")
      .select("author_name, rating, google_created_at, location_id")
      .eq("id", conversation.linked_review_id)
      .returns<ReviewLinkRow[]>()
      .maybeSingle();
    if (data) {
      const { data: loc } = await supabase
        .from("locations")
        .select("google_place_id")
        .eq("id", data.location_id)
        .maybeSingle<{ google_place_id: string | null }>();
      linkedReview = {
        author_name: data.author_name,
        rating: data.rating,
        google_created_at: data.google_created_at,
        place_id: loc?.google_place_id ?? null,
      };
    }
  }

  // Fetch linked client context
  let linkedClient: { full_name: string; sales_name: string | null } | null = null;
  if (conversation.linked_client_id) {
    const { data } = await supabase
      .from("clients")
      .select("full_name, sales_id")
      .eq("id", conversation.linked_client_id)
      .maybeSingle<{ full_name: string; sales_id: string }>();
    if (data) {
      let salesName: string | null = null;
      const { data: salesData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.sales_id)
        .maybeSingle<{ full_name: string }>();
      if (salesData) salesName = salesData.full_name;
      linkedClient = { full_name: data.full_name, sales_name: salesName };
    }
  }

  const openerProfile = authorMap.get(conversation.opener_id);
  const canClose = isResponder || conversation.opener_id === user.id;
  const isClosed = conversation.status === "closed";

  // Mark as read (fire-and-forget — server action, revalidates /soporte)
  markConversationRead(id);

  return (
    <>
      <Topbar
        title={conversation.subject}
        subtitle={openerProfile?.full_name ?? "Usuario"}
        range={null}
        breadcrumb="Soporte"
        breadcrumbHref="/soporte"
        compact
        right={
          <ConversationActions
            conversationId={id}
            status={conversation.status}
            canClose={canClose}
          />
        }
      />
      <div style={{ padding: "24px 32px", maxWidth: 800 }} className="m-page-pad">
        {/* Context card */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <CategoryPill category={conversation.category} />
          {isClosed && (
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: "#f0f0f0",
                color: "#888",
              }}
            >
              Cerrada
            </span>
          )}
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
            Abierta el{" "}
            {new Date(conversation.created_at).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>

        {/* Linked review card */}
        {linkedReview && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fafaf8",
              border: "1px solid var(--line)",
              borderRadius: 10,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
            }}
          >
            <Star size={14} style={{ color: "#eab308", flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{linkedReview.author_name}</span>
            <span style={{ color: "var(--ink-3)" }}>
              {"★".repeat(linkedReview.rating)}
              {"☆".repeat(5 - linkedReview.rating)}
            </span>
            <span style={{ color: "var(--ink-4)" }}>
              {new Date(linkedReview.google_created_at).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
              })}
            </span>
            {linkedReview.place_id && (
              <a
                href={buildGoogleReviewListUrl(linkedReview.place_id) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginLeft: "auto", color: "var(--ink-3)" }}
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        )}

        {/* Linked client card */}
        {linkedClient && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fafaf8",
              border: "1px solid var(--line)",
              borderRadius: 10,
              marginBottom: 20,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600 }}>Cliente: {linkedClient.full_name}</span>
            {linkedClient.sales_name && (
              <span style={{ color: "var(--ink-3)", marginLeft: 8 }}>
                (Comercial: {linkedClient.sales_name})
              </span>
            )}
          </div>
        )}

        {/* Message thread */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(messages ?? []).map((msg) => {
            const author = authorMap.get(msg.author_id);
            const authorRole = author?.role ?? "sales";
            const isResp = authorRole === "admin" || authorRole === "reviews_manager";
            return (
              <MessageBubble
                key={msg.id}
                authorName={author?.full_name ?? "Usuario"}
                authorAvatarUrl={author?.avatar_url ?? null}
                authorRole={authorRole}
                body={msg.body}
                createdAt={msg.created_at}
                isResponder={isResp}
              />
            );
          })}
        </div>

        {/* Composer */}
        <MessageComposer conversationId={id} disabled={isClosed} />

        {/* Closed hint */}
        {isClosed && (
          <div
            style={{
              textAlign: "center",
              padding: "16px 0 8px",
              fontSize: 13,
              color: "var(--ink-4)",
            }}
          >
            Esta consulta está cerrada.{" "}
            {canClose && "Puedes reabrirla con el botón de arriba."}
          </div>
        )}
      </div>
    </>
  );
}
