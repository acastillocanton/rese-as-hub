"use client";

import { useRouter } from "next/navigation";

export function DismissibleBanner({
  tone,
  children,
}: {
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const bg = tone === "ok" ? "var(--ok-bg, #e3f3e7)" : "var(--warn-bg)";
  const fg = tone === "ok" ? "var(--ok, #1d7a3a)" : "var(--warn)";

  return (
    <div
      role="status"
      style={{
        padding: "10px 14px",
        background: bg,
        color: fg,
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span>{children}</span>
      <button
        type="button"
        onClick={() => router.replace("/fichas")}
        aria-label="Cerrar mensaje"
        style={{
          flexShrink: 0,
          background: "transparent",
          border: "none",
          color: fg,
          opacity: 0.7,
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: "2px 6px",
        }}
      >
        ×
      </button>
    </div>
  );
}
