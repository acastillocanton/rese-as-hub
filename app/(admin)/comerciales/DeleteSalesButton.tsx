"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSales } from "./actions";

type Props = {
  id: string;
  name: string;
  /** Si el comercial está archivado mostramos un texto distinto (la
   *  pérdida es la misma pero el flujo mental del operador es otro). */
  archived?: boolean;
  /** Tras un delete exitoso, redirigir a /comerciales. Útil cuando el
   *  botón se invoca desde la ficha de detalle (`/comerciales/[slug]`). */
  redirectToList?: boolean;
};

export function DeleteSalesButton({
  id,
  name,
  archived = false,
  redirectToList = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `¿Eliminar PERMANENTEMENTE a ${name}?\n\n` +
        `Se borrarán:\n` +
        `  · Su cuenta de acceso a ReseñaHub.\n` +
        `  · Sus clientes y enlaces compartidos.\n` +
        `  · Sus reseñas perderán la atribución (quedarán huérfanas).\n\n` +
        (archived
          ? `Esta acción NO se puede deshacer.`
          : `Esta acción NO se puede deshacer. Para conservar el historial usa "Archivar" en su lugar.`),
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteSales(id);
      if (r.error) {
        alert(r.error);
        return;
      }
      if (redirectToList) {
        router.push("/comerciales");
      } else {
        router.refresh();
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
        border: "1px solid var(--warn)",
        borderRadius: 7,
        fontSize: 12,
        color: "var(--warn)",
        cursor: isPending ? "wait" : "pointer",
        fontWeight: 500,
      }}
    >
      {isPending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
