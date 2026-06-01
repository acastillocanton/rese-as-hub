"use client";

import { useState, useTransition } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import {
  MESSAGE_TEMPLATES,
  type MessageTemplateId,
  type SavedTemplates,
} from "@/lib/messaging";
import type { Brand } from "@/lib/supabase/types";
import { saveMessageTemplates } from "./actions";

type Props = {
  brand: Brand;
  saved: SavedTemplates;
};

type Draft = { label: string; body: string };

const PLACEHOLDERS = ["{nombre_cliente}", "{nombre_comercial}", "{url}"];

export function MyTemplatesEditor({ brand, saved }: Props) {
  // Estado por plantilla: nombre + cuerpo que ve el comercial. Precargamos con
  // su versión guardada si existe; si no, con los valores base.
  const initial = Object.fromEntries(
    MESSAGE_TEMPLATES.map((t) => [
      t.id,
      {
        label: saved?.[t.id]?.label?.trim() || t.label,
        body: saved?.[t.id]?.body?.trim() || t.build(brand),
      },
    ]),
  ) as Record<MessageTemplateId, Draft>;

  const [values, setValues] = useState<Record<MessageTemplateId, Draft>>(initial);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  function patch(id: MessageTemplateId, partial: Partial<Draft>) {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], ...partial } }));
    setFeedback(null);
  }

  function resetOne(id: MessageTemplateId) {
    const def = MESSAGE_TEMPLATES.find((t) => t.id === id);
    if (!def) return;
    patch(id, { label: def.label, body: def.build(brand) });
  }

  function onSave() {
    setFeedback(null);
    startTransition(async () => {
      const r = await saveMessageTemplates(values);
      if (r.ok) {
        setFeedback({ kind: "ok", text: "Plantillas guardadas." });
      } else {
        setFeedback({ kind: "error", text: r.error });
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.55 }}>
        Reescribe cualquiera de las 3 plantillas a tu forma de hablar —el nombre y
        el texto—. Lo que guardes aquí es lo que verás al compartir el enlace de un
        cliente. Mantén los comodines en el texto: se sustituyen solos por los
        datos de cada cliente:
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PLACEHOLDERS.map((p) => (
          <code
            key={p}
            style={{
              padding: "3px 8px",
              borderRadius: 7,
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-2)",
            }}
          >
            {p}
          </code>
        ))}
      </div>

      {MESSAGE_TEMPLATES.map((t) => {
        const draft = values[t.id];
        const isCustom =
          (saved?.[t.id]?.label?.trim() ?? "") !== "" ||
          (saved?.[t.id]?.body?.trim() ?? "") !== "";
        return (
          <div
            key={t.id}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              background: "var(--surface)",
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
                {t.description}
                {isCustom && (
                  <span style={{ marginLeft: 8, color: "var(--ink-4)" }}>· personalizada</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => resetOne(t.id)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--ink-3)",
                  fontSize: 11.5,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                Restablecer a la original
              </button>
            </div>

            <label
              htmlFor={`tpl-label-${t.id}`}
              style={{
                display: "block",
                fontSize: 11,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 5,
              }}
            >
              Nombre de la plantilla
            </label>
            <input
              id={`tpl-label-${t.id}`}
              type="text"
              value={draft.label}
              onChange={(e) => patch(t.id, { label: e.target.value })}
              maxLength={40}
              placeholder={t.label}
              style={{
                width: "100%",
                padding: "9px 12px",
                background: "var(--surface)",
                border: "1px solid var(--line-strong)",
                borderRadius: 9,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ink)",
                fontFamily: "inherit",
                marginBottom: 12,
              }}
            />

            <label
              htmlFor={`tpl-body-${t.id}`}
              style={{
                display: "block",
                fontSize: 11,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 5,
              }}
            >
              Mensaje
            </label>
            <textarea
              id={`tpl-body-${t.id}`}
              value={draft.body}
              onChange={(e) => patch(t.id, { body: e.target.value })}
              rows={7}
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--surface)",
                border: "1px solid var(--line-strong)",
                borderRadius: 10,
                fontSize: 13.5,
                color: "var(--ink)",
                fontFamily: "inherit",
                lineHeight: 1.5,
                resize: "vertical",
              }}
            />
          </div>
        );
      })}

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <GhostBtn primary onClick={onSave} disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar plantillas"}
        </GhostBtn>
        {feedback && (
          <span
            role={feedback.kind === "error" ? "alert" : "status"}
            style={{
              fontSize: 13,
              color: feedback.kind === "error" ? "var(--warn)" : "var(--ink-3)",
            }}
          >
            {feedback.text}
          </span>
        )}
      </div>
    </div>
  );
}
