"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = { state: "idle" } | { state: "verifying" } | { state: "error"; message: string };

export function ManualLoginClient({ tokenHash }: { tokenHash: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(
    tokenHash ? { state: "verifying" } : { state: "error", message: "Falta el parámetro ?token=…" },
  );

  useEffect(() => {
    if (!tokenHash) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "magiclink",
        });
        if (cancelled) return;
        if (error) {
          setStatus({ state: "error", message: error.message });
          return;
        }
        router.replace("/");
        router.refresh();
      } catch (e) {
        if (cancelled) return;
        setStatus({
          state: "error",
          message: e instanceof Error ? e.message : "Error inesperado.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenHash, router]);

  return (
    <div role="status" aria-live="polite">
      <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
        Acceso manual (workaround sin email)
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
        {status.state === "verifying" && "Verificando token…"}
        {status.state === "error" && "No ha sido posible entrar"}
        {status.state === "idle" && "Sin token"}
      </div>
      {status.state === "error" && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "var(--warn-bg)",
            color: "var(--warn)",
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          {status.message} ·{" "}
          <a href="/login" style={{ color: "inherit", textDecoration: "underline" }}>
            volver a login
          </a>
        </div>
      )}
    </div>
  );
}
