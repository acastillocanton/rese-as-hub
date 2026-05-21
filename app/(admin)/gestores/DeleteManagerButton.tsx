"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReviewsManager } from "./actions";

type Props = {
  id: string;
  name: string;
};

export function DeleteManagerButton({ id, name }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `¿Eliminar a ${name}?\n\nPerderá el acceso a ReseñaHub. Las reseñas no se ven afectadas (el gestor solo lee).`,
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteReviewsManager(id);
      if (r.error) {
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
        padding: "5px 10px",
        background: "transparent",
        border: "1px solid var(--line-strong)",
        borderRadius: 7,
        fontSize: 12,
        color: "var(--ink-3)",
        cursor: isPending ? "wait" : "pointer",
        fontWeight: 400,
      }}
    >
      {isPending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
