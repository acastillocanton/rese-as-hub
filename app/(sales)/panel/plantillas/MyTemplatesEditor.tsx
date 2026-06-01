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

const PLACEHOLDERS = ["{nombre_cliente}", "{nombre_comercial}", "{url}"];

export function MyTemplatesEditor({ brand, saved }: Props) {
  // Estado por plantilla: el texto que ve el comercial. Precargamos con su
  // versión guardada si existe; si no, con la base de código (build(brand)).
  const initial = Object.fromEntries(
    MESSAGE_TEMPLATES.map((t) => [t.id, saved?.[t.id]?.trim() || t.build(brand)]),
  ) as Record<MessageTemplateId, string>;

  const [values, setValues] = useState<Record<MessageTemplateId, string>>(initial);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  function setValue(id: MessageTemplateId, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }));
    setFeedback(null);
  }

  function resetOne(id: MessageTemplateId) {
    const def = MESSAGE_TEMPLATES.find((t) => t.id === id);
    if (!def) return;
    setValue(id, def.build(brand));
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
        Reescribe cualquiera de las 3 plantillas a tu forma de hablar. Lo que
        guardes aquí es lo que verás al compartir el enlace de un cliente. Mantén
        los comodines —se sustituyen solos por los datos de cada cliente:
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
        const isCustom = (saved?.[t.id]?.trim() ?? "") !== "";
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
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {t.label}
                  {isCustom && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 500,
                        color: "var(--ink-4)",
                      }}
                    >
                      · personalizada
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 2 }}>
                  {t.description}
                </div>
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
            <textarea
              value={values[t.id]}
              onChange={(e) => setValue(t.id, e.target.value)}
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
