"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSales } from "./actions";

type Props = {
  id: string;
  name: string;
  redirectTo?: string;
  variant?: "compact" | "prominent";
};

export function DeleteSalesButton({ id, name, redirectTo, variant = "compact" }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function onClick() {
    const ok = window.confirm(
      `¿Eliminar a ${name}?\n\nSe borrarán también sus clientes, enlaces y reseñas atribuidas.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const r = await deleteSales(id);
      if (r.error) {
        alert(r.error);
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      }
    });
  }
  const isProminent = variant === "prominent";
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
            : "var(--warn)"
          : "var(--ink-3)",
        cursor: isPending ? "wait" : "pointer",
        fontWeight: isProminent ? 500 : 400,
      }}
    >
      {isPending ? "Eliminando…" : isProminent ? "Eliminar comercial" : "Eliminar"}
    </button>
  );
}
