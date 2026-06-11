"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveDirector, restoreDirector } from "./actions";

type Mode = "archive" | "restore";

type Props = {
  id: string;
  name: string;
  /** Comerciales que tiene asignados (informativo en el confirm). */
  teamCount?: number;
  /** "archive" (default) muestra "Archivar"; "restore" muestra "Restaurar". */
  mode?: Mode;
  redirectTo?: string;
  variant?: "compact" | "prominent";
};

export function ArchiveDirectorButton({
  id,
  name,
  teamCount,
  mode = "archive",
  redirectTo,
  variant = "compact",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    const teamWarning =
      mode === "archive" && teamCount && teamCount > 0
        ? `\n\n⚠️ Tiene ${teamCount} comercial${teamCount === 1 ? "" : "es"} asignado${teamCount === 1 ? "" : "s"} — al archivarlo dejarán de tener responsable. Recuerda reasignarlos.`
        : "";
    const ok =
      mode === "archive"
        ? window.confirm(
            `¿Archivar al responsable ${name}?\n\nNo podrá iniciar sesión y desaparece del listado activo. Sus comerciales asignados conservan la atribución de reseñas pero quedan sin responsable. Puedes restaurarlo desde "Ver archivados".${teamWarning}`,
          )
        : window.confirm(
            `¿Restaurar al responsable ${name}? Volverá al listado como Invitado y podrás reenviarle acceso.`,
          );
    if (!ok) return;
    startTransition(async () => {
      const r =
        mode === "archive" ? await archiveDirector(id) : await restoreDirector(id);
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
  const prominentLabel = mode === "archive" ? "Archivar responsable" : "Restaurar responsable";
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
