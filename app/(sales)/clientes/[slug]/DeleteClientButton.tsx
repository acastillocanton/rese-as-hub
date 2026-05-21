"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteClientRecord } from "../actions";

export function DeleteClientButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `¿Eliminar a ${name}?\n\nSu enlace dejará de funcionar para nuevas reseñas; las reseñas ya atribuidas se conservan.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteClientRecord(id);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      router.push("/clientes");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      style={{
        padding: "7px 12px",
        background: "transparent",
        border: "1px solid var(--line-strong)",
        borderRadius: 9,
        fontSize: 13,
        color: isPending ? "var(--ink-4)" : "var(--warn)",
        cursor: isPending ? "wait" : "pointer",
        fontWeight: 500,
      }}
    >
      {isPending ? "Eliminando…" : "Eliminar cliente"}
    </button>
  );
}
