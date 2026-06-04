import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { CategoryPill } from "./CategoryPill";
import type { SupportCategory, SupportStatus } from "@/lib/supabase/types";

type ConversationRowProps = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  openerName: string;
  openerAvatarUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  isUnread: boolean;
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function ConversationRow(props: ConversationRowProps) {
  const isClosed = props.status === "closed";

  return (
    <Link
      href={`/soporte/${props.id}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 10,
        background: props.isUnread ? "rgba(37, 99, 235, 0.04)" : "var(--surface)",
        border: "1px solid var(--line)",
        textDecoration: "none",
        color: "inherit",
        transition: "background 0.15s",
      }}
    >
      <Avatar name={props.openerName} size={36} src={props.openerAvatarUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontWeight: props.isUnread ? 700 : 600,
              fontSize: 14,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {props.isUnread && (
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: "#2563eb",
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
            )}
            {props.subject}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-4)", flexShrink: 0 }}>
            {relativeTime(props.lastMessageAt)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 500 }}>
            {props.openerName}
          </span>
          <CategoryPill category={props.category} />
          {isClosed && (
            <span
              style={{
                display: "inline-block",
                padding: "1px 6px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 600,
                background: "#f0f0f0",
                color: "#888",
              }}
            >
              Cerrada
            </span>
          )}
        </div>
        {props.lastMessagePreview && (
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: "var(--ink-3)",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {props.lastMessagePreview}
          </div>
        )}
      </div>
    </Link>
  );
}
