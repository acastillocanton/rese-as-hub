"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import {
  DEFAULT_EMAIL_SUBJECT,
  emailHref,
  MESSAGE_TEMPLATES,
  type MessageTemplateId,
  renderMessage,
  resolveTemplate,
  type SavedTemplates,
  smsHref,
  whatsappHref,
} from "@/lib/messaging";
import type { Brand } from "@/lib/supabase/types";

export type ShareBlockProps = {
  appBase: string;
  salesName: string;
  salesSlug: string;
  clientName: string;
  clientSlug: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  qrSize?: number;
  brand: Brand;
  /** Versiones personalizadas del comercial (profiles.message_templates). */
  templates?: SavedTemplates;
};

export function ShareBlock({
  appBase,
  salesName,
  salesSlug,
  clientName,
  clientSlug,
  clientEmail,
  clientPhone,
  qrSize = 144,
  brand,
  templates,
}: ShareBlockProps) {
  const fullUrl = `${appBase}/c/${salesSlug}/${clientSlug}`;
  const displayUrl = fullUrl.replace(/^https?:\/\//, "");

  // Renderiza la plantilla `id` (override del comercial o base) con los datos
  // de este cliente. Memoizado por las deps que afectan al texto.
  const buildMessage = useCallback(
    (id: MessageTemplateId) =>
      renderMessage(resolveTemplate(id, brand, templates), {
        nombre_cliente: clientName.split(" ")[0] || clientName,
        nombre_comercial: salesName.split(" ")[0] || salesName,
        url: fullUrl,
      }),
    [clientName, salesName, fullUrl, brand, templates],
  );

  // Pestaña activa + texto. Al cambiar de pestaña se recalcula el texto;
  // los retoques manuales del textarea son efímeros (se pierden al cambiar).
  const [activeId, setActiveId] = useState<MessageTemplateId>("post_visita");
  const [message, setMessage] = useState(() => buildMessage("post_visita"));
  const [copied, setCopied] = useState(false);

  function selectTemplate(id: MessageTemplateId) {
    setActiveId(id);
    setMessage(buildMessage(id));
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <div
        style={{
          padding: "12px 14px",
          border: "1px solid var(--line-strong)",
          borderRadius: 10,
          background: "var(--surface-2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            color: "var(--ink-2)",
            wordBreak: "break-all",
          }}
        >
          {displayUrl}
        </span>
        <GhostBtn primary onClick={copyUrl}>
          {copied ? "✓ Copiado" : "Copiar"}
        </GhostBtn>
      </div>

      <div
        className="m-qr-grid"
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: `${qrSize + 24}px 1fr`,
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            padding: 12,
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "#fff",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <QRCodeSVG value={fullUrl} size={qrSize} level="M" includeMargin={false} />
        </div>

        <div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 6,
            }}
          >
            Mensaje
          </div>
          {/* Selector de plantilla (3 perfiles). La activa rellena el textarea. */}
          <div
            role="tablist"
            aria-label="Plantilla de mensaje"
            style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}
          >
            {MESSAGE_TEMPLATES.map((t) => {
              const active = t.id === activeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={t.description}
                  onClick={() => selectTemplate(t.id)}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "var(--ink)" : "var(--line-strong)"}`,
                    background: active ? "var(--ink)" : "var(--surface)",
                    color: active ? "#fff" : "var(--ink-2)",
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              borderRadius: 9,
              fontSize: 13,
              color: "var(--ink)",
              fontFamily: "inherit",
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={whatsappHref(clientPhone, message)}
              target="_blank"
              rel="noopener noreferrer"
              style={linkBtnStyle(true)}
            >
              WhatsApp
            </a>
            <a
              href={emailHref(clientEmail, DEFAULT_EMAIL_SUBJECT, message)}
              style={linkBtnStyle(false)}
            >
              Email
            </a>
            <a href={smsHref(clientPhone, message)} style={linkBtnStyle(false)}>
              SMS
            </a>
          </div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 11.5,
              color: "var(--ink-4)",
              lineHeight: 1.55,
            }}
          >
            Edita el texto si quieres para este envío.{" "}
            {clientPhone ? null : (
              <>
                No tienes teléfono del cliente: WhatsApp abrirá para que elijas
                contacto.{" "}
              </>
            )}
            <Link
              href="/panel/plantillas"
              style={{ color: "var(--ink-3)", textDecoration: "underline" }}
            >
              Editar mis plantillas →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function linkBtnStyle(primary: boolean): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "7px 12px",
    border: "1px solid var(--line-strong)",
    background: primary ? "var(--ink)" : "var(--surface)",
    color: primary ? "#fff" : "var(--ink)",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
  };
}
