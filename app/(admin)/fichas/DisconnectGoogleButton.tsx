"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGoogleLocation } from "./actions";

export function DisconnectGoogleButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `¿Desconectar Google de "${name}"?\n\nLos tokens se borran. El cron dejará de sincronizar reseñas para esta ficha hasta que la reconectes.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await disconnectGoogleLocation(id);
      if ("error" in r && r.error) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      style={{
        padding: "6px 11px",
        border: "1px solid var(--line-strong)",
        borderRadius: 8,
        fontSize: 12.5,
        color: isPending ? "var(--ink-4)" : "var(--ink-2)",
        background: "var(--surface)",
        cursor: isPending ? "wait" : "pointer",
        fontWeight: 500,
      }}
    >
      {isPending ? "Desconectando…" : "Desconectar"}
    </button>
  );
}
