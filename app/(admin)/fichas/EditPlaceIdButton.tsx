"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLocationPlaceId } from "./actions";

/**
 * Botón inline para editar el `google_place_id` de una ficha. Usa un
 * window.prompt() simple — la idea es que el admin pegue el Place ID que
 * obtiene de Google Maps y se acabó. Si en el futuro hace falta una UI
 * más rica (búsqueda, validación en vivo), reemplazar por un modal.
 */
export function EditPlaceIdButton({
  id,
  currentPlaceId,
}: {
  id: string;
  currentPlaceId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    const next = window.prompt(
      `Place ID de Google para esta ficha.\n\nLo encuentras en:\n- Google Maps → ficha del negocio → "Compartir" o\n- https://developers.google.com/maps/documentation/places/web-service/place-id\n\nDeja vacío para borrar.`,
      currentPlaceId ?? "",
    );
    if (next === null) return; // canceló
    startTransition(async () => {
      const result = await updateLocationPlaceId({
        locationId: id,
        googlePlaceId: next.trim() === "" ? null : next.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        window.alert(`Error: ${result.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
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
      >
        {isPending ? "Guardando…" : currentPlaceId ? "Editar Place ID" : "Añadir Place ID"}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "var(--warn, #b35900)" }}>{error}</span>
      )}
    </>
  );
}
