"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import {
  DEFAULT_EMAIL_SUBJECT,
  emailHref,
  getGenericLinkTemplate,
  smsHref,
  whatsappHref,
} from "@/lib/messaging";
import type { Brand } from "@/lib/supabase/types";

function renderGeneric(template: string, comercial: string, url: string): string {
  return template
    .replace(/\{nombre_comercial\}/g, comercial)
    .replace(/\{url\}/g, url);
}

type Props = {
  fullUrl: string;
  displayUrl: string;
  salesName: string;
  salesSlug: string;
  brand: Brand;
};

export function LinkArsenalBlock({ fullUrl, displayUrl, salesName, salesSlug, brand }: Props) {
  const firstName = salesName.split(" ")[0] || salesName;
  const [message, setMessage] = useState(() =>
    renderGeneric(getGenericLinkTemplate(brand), firstName, fullUrl),
  );
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1500);
    } catch {
      // ignore
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 1500);
    } catch {
      // ignore
    }
  }

  function downloadQR() {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.download = `qr-resenahub-${salesSlug}.png`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function resetMessage() {
    setMessage(renderGeneric(getGenericLinkTemplate(brand), firstName, fullUrl));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* URL grande con copiar */}
      <div
        style={{
          padding: "16px 18px",
          border: "1px solid var(--line-strong)",
          borderRadius: 12,
          background: "var(--surface-2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 280px" }}>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 4,
            }}
          >
            Tu enlace
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              color: "var(--ink)",
              wordBreak: "break-all",
            }}
          >
            {displayUrl}
          </span>
        </div>
        <GhostBtn primary onClick={copyUrl}>
          {copiedUrl ? "✓ Copiado" : "Copiar"}
        </GhostBtn>
      </div>

      {/* QR + Mensaje en dos columnas */}
      <div
        className="m-qr-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 260px) 1fr",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        {/* QR + download */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div
            ref={qrRef}
            style={{
              padding: 16,
              border: "1px solid var(--line)",
              borderRadius: 12,
              background: "#fff",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <QRCodeCanvas
              value={fullUrl}
              size={200}
              level="M"
              marginSize={0}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>
          <GhostBtn onClick={downloadQR}>Descargar PNG</GhostBtn>
          <p
            style={{
              margin: 0,
              fontSize: 11.5,
              color: "var(--ink-4)",
              textAlign: "center",
              lineHeight: 1.45,
              maxWidth: 220,
            }}
          >
            Imprímelo y ponlo en el mostrador, en una tarjeta, en el display de tu oficina.
          </p>
        </div>

        {/* Mensaje + deep-links */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                color: "var(--ink-4)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Plantilla de mensaje
            </div>
            <button
              type="button"
              onClick={resetMessage}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--ink-3)",
                fontSize: 11.5,
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              Restablecer
            </button>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
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
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={whatsappHref(null, message)}
              target="_blank"
              rel="noopener noreferrer"
              style={linkBtnStyle(true)}
            >
              WhatsApp
            </a>
            <a href={emailHref(null, DEFAULT_EMAIL_SUBJECT, message)} style={linkBtnStyle(false)}>
              Email
            </a>
            <a href={smsHref(null, message)} style={linkBtnStyle(false)}>
              SMS
            </a>
            <button type="button" onClick={copyMessage} style={linkBtnStyle(false, true)}>
              {copiedMsg ? "✓ Copiado" : "Copiar texto"}
            </button>
          </div>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 11.5,
              color: "var(--ink-4)",
              lineHeight: 1.55,
            }}
          >
            Sin destinatario: WhatsApp / Email / SMS te abrirán el cliente correspondiente para que elijas a quién enviarlo.
          </p>
        </div>
      </div>
    </div>
  );
}

function linkBtnStyle(primary: boolean, asButton = false): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "8px 14px",
    border: "1px solid var(--line-strong)",
    background: primary ? "var(--ink)" : "var(--surface)",
    color: primary ? "#fff" : "var(--ink)",
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    cursor: asButton ? "pointer" : undefined,
    fontFamily: "inherit",
  };
}
