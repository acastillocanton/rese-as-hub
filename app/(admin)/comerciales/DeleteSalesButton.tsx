"use client";

import { useTransition } from "react";
import { deleteSales } from "./actions";

export function DeleteSalesButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition();
  function onClick() {
    const ok = window.confirm(
      `¿Eliminar a ${name}?\n\nSe borrarán también sus clientes, enlaces y reseñas atribuidas.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteSales(id);
      if (r.error) alert(r.error);
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      style={{
        padding: "5px 10px",
        background: "transparent",
        border: "1px solid var(--line-strong)",
        borderRadius: 7,
        fontSize: 12,
        color: "var(--ink-3)",
        cursor: isPending ? "wait" : "pointer",
      }}
    >
      {isPending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
