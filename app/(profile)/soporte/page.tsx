import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { ConversationRow } from "@/components/soporte/ConversationRow";
import { SupportHoursNotice } from "@/components/soporte/SupportHoursNotice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Role, SupportCategory, SupportStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function SoportePage() {
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

  const role = profile?.role ?? null;
  const isResponder = role === "admin" || role === "reviews_manager";

  type ConvRow = {
    id: string;
    subject: string;
    category: string;
    status: string;
    opener_id: string;
    last_message_at: string;
    created_at: string;
    closed_at: string | null;
  };

  // Fetch conversations — RLS scopes by role automatically
  const { data: conversations } = await supabase
    .from("support_conversations")
    .select(
      "id, subject, category, status, opener_id, last_message_at, created_at, closed_at",
    )
    .order("last_message_at", { ascending: false })
    .limit(200)
    .returns<ConvRow[]>();

  // Fetch opener profiles for display
  const openerIds = [...new Set((conversations ?? []).map((c) => c.opener_id))];
  let openerMap = new Map<string, { full_name: string; avatar_url: string | null }>();
  if (openerIds.length > 0) {
    const { data: openers } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", openerIds)
      .returns<{ id: string; full_name: string; avatar_url: string | null }[]>();
    if (openers) {
      openerMap = new Map(openers.map((o) => [o.id, { full_name: o.full_name, avatar_url: o.avatar_url }]));
    }
  }

  // Fetch last message preview per conversation
  const convIds = (conversations ?? []).map((c) => c.id);
  let lastMessageMap = new Map<string, string>();
  if (convIds.length > 0) {
    // Get the latest message per conversation
    const { data: messages } = await supabase
      .from("support_messages")
      .select("conversation_id, body")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<{ conversation_id: string; body: string }[]>();
    if (messages) {
      for (const msg of messages) {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg.body.slice(0, 120));
        }
      }
    }
  }

  // Fetch read receipts for unread detection
  const { data: receipts } = await supabase
    .from("support_read_receipts")
    .select("conversation_id, last_read_at")
    .eq("user_id", user.id)
    .returns<{ conversation_id: string; last_read_at: string }[]>();
  const readMap = new Map(
    (receipts ?? []).map((r) => [r.conversation_id, r.last_read_at]),
  );

  const rows = (conversations ?? []).map((c) => {
    const opener = openerMap.get(c.opener_id);
    const lastReadAt = readMap.get(c.id);
    const isUnread = !lastReadAt || new Date(c.last_message_at) > new Date(lastReadAt);
    return {
      id: c.id,
      subject: c.subject,
      category: c.category as SupportCategory,
      status: c.status as SupportStatus,
      openerName: opener?.full_name ?? "Usuario",
      openerAvatarUrl: opener?.avatar_url ?? null,
      lastMessagePreview: lastMessageMap.get(c.id) ?? null,
      lastMessageAt: c.last_message_at,
      isUnread,
    };
  });

  const openCount = rows.filter((r) => r.status === "open").length;
  const closedCount = rows.filter((r) => r.status === "closed").length;

  return (
    <>
      <Topbar
        title="Soporte"
        subtitle={isResponder ? `${openCount} abiertas · ${closedCount} cerradas` : undefined}
        range={null}
        compact
        right={
          <Link href="/soporte/nueva" style={{ textDecoration: "none" }}>
            <GhostBtn primary>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Plus size={15} />
                Nueva consulta
              </span>
            </GhostBtn>
          </Link>
        }
      />
      <div style={{ padding: "24px 32px", maxWidth: 800 }} className="m-page-pad">
        <div style={{ marginBottom: 16 }}>
          <SupportHoursNotice />
        </div>
        {rows.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              color: "var(--ink-3)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              {isResponder ? "Sin consultas pendientes" : "No has abierto ninguna consulta"}
            </div>
            <div style={{ fontSize: 13 }}>
              {isResponder
                ? "Cuando un comercial o director abra una consulta, aparecerá aquí."
                : "Si tienes alguna duda o problema, abre una consulta y te responderemos."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((row) => (
              <ConversationRow key={row.id} {...row} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
