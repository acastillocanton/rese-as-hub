"use client";

import { useState, useTransition } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { createClient } from "@/lib/supabase/client";

type Props = {
  next?: string;
  error?: string;
  sent: boolean;
};

export function LoginForm({ next, error, sent }: Props) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(sent);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    error === "no-profile"
      ? "No tienes acceso todavía. Pide a tu administrador que te invite."
      : null,
  );
  const [isPending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setErrorMessage(null);
    const rawEmail = String(formData.get("email") ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
      setErrorMessage("Introduce un email válido.");
      return;
    }
    startTransition(async () => {
      // Sin emailRedirectTo: Supabase genera un token OTP (no PKCE) que el
      // handler /auth/confirm puede verificar con verifyOtp({ token_hash, type }).
      // Pasar emailRedirectTo forzaría flujo PKCE y el token llegaría con prefijo
      // pkce_, incompatible con la plantilla del email que usa {{ .TokenHash }}.
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: rawEmail,
        options: {
          shouldCreateUser: false,
        },
      });
      if (signInError) {
        console.error("[login] signInWithOtp failed:", signInError);
        const detail =
          signInError.status === 429
            ? "Estás pidiendo demasiados emails seguidos. Espera 60 segundos y vuelve a intentarlo."
            : signInError.message;
        setErrorMessage(`No hemos podido enviar el correo: ${detail}`);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div role="status" aria-live="polite">
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          Revisa tu correo
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
          Te hemos enviado un enlace mágico a <strong>{email}</strong>. Ábrelo desde el
          mismo dispositivo en el que estás ahora.
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} noValidate>
      <label
        htmlFor="email"
        style={{
          display: "block",
          fontSize: 11.5,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 6,
        }}
      >
        Email corporativo
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nombre@inseryal.com"
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid var(--line-strong)",
          borderRadius: 9,
          fontSize: 14,
          fontFamily: "var(--font-mono)",
          background: "var(--surface)",
        }}
      />
      {next && <input type="hidden" name="next" value={next} />}
      {errorMessage && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "8px 10px",
            background: "var(--warn-bg)",
            color: "var(--warn)",
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          {errorMessage}
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <GhostBtn primary type="submit" disabled={isPending} style={{ width: "100%" }}>
          {isPending ? "Enviando…" : "Enviarme enlace de acceso"}
        </GhostBtn>
      </div>
    </form>
  );
}
