"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveSales, restoreSales } from "./actions";

type Mode = "archive" | "restore";

type Props = {
  id: string;
  name: string;
  /** "archive" (default) muestra "Archivar"; "restore" muestra "Restaurar". */
  mode?: Mode;
  redirectTo?: string;
  variant?: "compact" | "prominent";
};

export function ArchiveSalesButton({
  id,
  name,
  mode = "archive",
  redirectTo,
  variant = "compact",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const ok =
      mode === "archive"
        ? window.confirm(
            `¿Archivar a ${name}?\n\nDejará de aparecer en el listado y no podrá iniciar sesión, pero sus reseñas atribuidas se conservarán y se incluirán en la fila "Bajas comerciales" del parte mensual. Puedes restaurarlo en cualquier momento desde el filtro "Ver archivados".`,
          )
        : window.confirm(`¿Restaurar a ${name}? Volverá al listado como Invitado.`);
    if (!ok) return;
    startTransition(async () => {
      const r = mode === "archive" ? await archiveSales(id) : await restoreSales(id);
      if (r.error) {
        alert(r.error);
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    });
  }

  const isProminent = variant === "prominent";
  const compactLabel = mode === "archive" ? "Archivar" : "Restaurar";
  const prominentLabel = mode === "archive" ? "Archivar comercial" : "Restaurar comercial";
  const pendingLabel = mode === "archive" ? "Archivando…" : "Restaurando…";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      style={{
        padding: isProminent ? "7px 12px" : "5px 10px",
        background: "transparent",
        border: "1px solid var(--line-strong)",
        borderRadius: isProminent ? 9 : 7,
        fontSize: isProminent ? 13 : 12,
        color: isProminent
          ? isPending
            ? "var(--ink-4)"
            : mode === "archive"
              ? "var(--warn)"
              : "var(--ink-2)"
          : "var(--ink-3)",
        cursor: isPending ? "wait" : "pointer",
        fontWeight: isProminent ? 500 : 400,
      }}
    >
      {isPending ? pendingLabel : isProminent ? prominentLabel : compactLabel}
    </button>
  );
}
