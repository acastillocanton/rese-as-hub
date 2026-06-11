import { Avatar } from "@/components/ui/Avatar";
import type { Role } from "@/lib/supabase/types";

type MessageBubbleProps = {
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: Role;
  body: string;
  createdAt: string;
  isResponder: boolean;
};

function roleLabel(role: Role): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "reviews_manager":
      return "Gestor";
    case "office_director":
      return "Responsable";
    case "sales":
      return "Comercial";
  }
}

const TZ = "Europe/Madrid";

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const fmt = (dt: Date) =>
    dt.toLocaleDateString("es-ES", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const isToday = fmt(d) === fmt(now);
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (isToday) return time;
  return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: TZ })} ${time}`;
}

export function MessageBubble(props: MessageBubbleProps) {
  const bgColor = props.isResponder ? "#f0f4ff" : "#fafaf8";
  const borderColor = props.isResponder ? "#dbe4ff" : "#e5e5e5";

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Avatar name={props.authorName} size={32} src={props.authorAvatarUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
            {props.authorName}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 5,
              background: props.isResponder ? "#eef2ff" : "#f0f0f0",
              color: props.isResponder ? "#4338ca" : "#888",
            }}
          >
            {roleLabel(props.authorRole)}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: "auto" }}>
            {formatTime(props.createdAt)}
          </span>
        </div>
        <div
          style={{
            padding: "12px 16px",
            background: bgColor,
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {props.body}
        </div>
      </div>
    </div>
  );
}
