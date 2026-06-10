"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Shortcut = {
  key: string;
  label: string;
  from: string; // yyyy-mm-dd
  to: string;
  rangeLabel: string;
};

type Props = {
  /** Valor actual del rango aplicado (yyyy-mm-dd). */
  from: string;
  to: string;
  /** Etiqueta humana del rango activo (ej "mayo 2026"). */
  label: string;
  /** Atajos pre-calculados desde el server con sus fechas. */
  shortcuts: Shortcut[];
  /** Query params a BORRAR al aplicar un rango (además de setear from/to).
   *  Ej: `["page"]` para resetear la paginación al cambiar de periodo.
   *  Por defecto no borra nada (comportamiento histórico de manager/dashboard). */
  resetParams?: string[];
};

/**
 * Dropdown de rango de fechas. Muestra el rango actual en un botón;
 * al abrir, ofrece los atajos rápidos y un formulario de rango libre.
 *
 * Navega cambiando los query params `from` y `to` y conservando el
 * resto. El padre re-renderiza vía Server Components automáticamente.
 */
export function RangePicker({ from, to, label, shortcuts, resetParams }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const ref = useRef<HTMLDivElement>(null);

  // Sincroniza el form cuando cambia el rango aplicado desde el server.
  useEffect(() => {
    setCustomFrom(from);
    setCustomTo(to);
  }, [from, to]);

  // Cierra el popover al hacer click fuera o pulsar Esc.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeShortcut = shortcuts.find((s) => s.from === from && s.to === to);

  function applyRange(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("from", nextFrom);
    params.set("to", nextTo);
    for (const p of resetParams ?? []) params.delete(p);
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customFrom || !customTo) return;
    applyRange(customFrom, customTo);
  }

  const buttonLabel = activeShortcut
    ? `${activeShortcut.label} · ${activeShortcut.rangeLabel}`
    : label;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          borderRadius: 9,
          fontSize: 13,
          fontWeight: 500,
          color: "var(--ink)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span aria-hidden="true" style={{ color: "var(--ink-4)" }}>◴</span>
        <span>{buttonLabel}</span>
        <span aria-hidden="true" style={{ color: "var(--ink-4)", marginLeft: 4, fontSize: 10 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Seleccionar rango de fechas"
          className="m-rangepicker-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 40,
            width: 320,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
                padding: "0 4px 4px",
              }}
            >
              Atajos
            </div>
            {shortcuts.map((s) => {
              const isActive = activeShortcut?.key === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => applyRange(s.from, s.to)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 10px",
                    background: isActive ? "rgba(0,0,0,0.05)" : "transparent",
                    border: 0,
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    color: "var(--ink)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span>{s.label}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-4)", fontWeight: 400 }}>
                    {s.rangeLabel}
                  </span>
                </button>
              );
            })}
          </div>

          <form
            onSubmit={handleCustomSubmit}
            style={{
              borderTop: "1px solid var(--line)",
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
                padding: "0 4px",
              }}
            >
              Personalizar
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Desde</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Hasta</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={!customFrom || !customTo}
              style={{
                marginTop: 4,
                padding: "8px 12px",
                background: "var(--ink)",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: !customFrom || !customTo ? "not-allowed" : "pointer",
                opacity: !customFrom || !customTo ? 0.5 : 1,
              }}
            >
              Aplicar rango
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid var(--line-strong)",
  borderRadius: 7,
  fontSize: 12.5,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--ink)",
};
