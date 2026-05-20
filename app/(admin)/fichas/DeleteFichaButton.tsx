"use client";

import { useTransition } from "react";
import { deleteLocation } from "./actions";

export function DeleteFichaButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const confirmed = window.confirm(
      `¿Eliminar la ficha "${name}"?\n\nEsto borrará también todos sus comerciales, clientes, enlaces y reseñas asociadas. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteLocation(id);
      if (result.error) {
        alert(result.error);
      }
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
