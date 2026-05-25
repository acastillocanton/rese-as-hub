"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLocationBrand } from "./actions";
import { BRAND_OPTIONS, getBrandLabel } from "@/lib/branding";
import type { Brand } from "@/lib/supabase/types";

/**
 * Botón inline para cambiar la marca operativa de una ficha. Solo admin.
 * La marca gobierna el branding que ven los usuarios asignados a esta ficha
 * (sidebar, breadcrumb, plantillas que copian al cliente, email del cron).
 */
export function EditBrandButton({
  id,
  currentBrand,
}: {
  id: string;
  currentBrand: Brand;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function pick(next: Brand) {
    setOpen(false);
    if (next === currentBrand) return;
    startTransition(async () => {
      const result = await updateLocationBrand({ locationId: id, brand: next });
      if (!result.ok) {
        window.alert(`Error: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        style={{
          padding: "6px 11px",
          border: "1px solid var(--line-strong)",
          borderRadius: 8,
          fontSize: 12.5,
          color: "var(--ink)",
          background: "var(--surface)",
          fontWeight: 500,
          cursor: isPending ? "default" : "pointer",
        }}
        title={`Marca actual: ${getBrandLabel(currentBrand)}`}
      >
        {isPending ? "Guardando…" : "Cambiar marca"}
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              zIndex: 50,
              minWidth: 220,
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              borderRadius: 10,
              boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
              padding: 6,
            }}
          >
            {BRAND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => pick(opt.value)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  fontSize: 13,
                  background: opt.value === currentBrand ? "var(--surface-2)" : "transparent",
                  color: "var(--ink)",
                  border: 0,
                  borderRadius: 7,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: opt.value === currentBrand ? 600 : 400,
                }}
              >
                {opt.label}
                {opt.value === currentBrand && (
                  <span style={{ marginLeft: 8, color: "var(--ink-4)", fontSize: 11 }}>
                    actual
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
