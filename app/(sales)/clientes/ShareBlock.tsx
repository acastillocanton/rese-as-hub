"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import {
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_REVIEW_MESSAGE_TEMPLATE,
  emailHref,
  renderMessage,
  smsHref,
  whatsappHref,
} from "@/lib/messaging";

export type ShareBlockProps = {
  appBase: string;
  salesName: string;
  salesSlug: string;
  clientName: string;
  clientSlug: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  qrSize?: number;
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
}: ShareBlockProps) {
  const fullUrl = `${appBase}/c/${salesSlug}/${clientSlug}`;
  const displayUrl = fullUrl.replace(/^https?:\/\//, "");

  const initialMessage = useMemo(
    () =>
      renderMessage(DEFAULT_REVIEW_MESSAGE_TEMPLATE, {
        nombre_cliente: clientName.split(" ")[0] || clientName,
        nombre_comercial: salesName.split(" ")[0] || salesName,
        url: fullUrl,
      }),
    [clientName, salesName, fullUrl],
  );

  const [message, setMessage] = useState(initialMessage);
  const [copied, setCopied] = useState(false);

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
            Edita el texto si quieres.{" "}
            {clientPhone ? null : (
              <>
                No tienes teléfono del cliente: WhatsApp abrirá para que elijas
                contacto.
              </>
            )}
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
