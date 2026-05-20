"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSafeNext } from "@/lib/url-validation";

type Props = {
  code: string | null;
  next: string;
};

export function CallbackHandler({ code, next }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const safeNext = isSafeNext(next) ? next : "/";

    async function finish() {
      try {
        // Flow A — PKCE: code is in the query string.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError(error.message);
            return;
          }
          router.replace(safeNext);
          router.refresh();
          return;
        }

        // Flow B — implicit / signup verify: tokens are in the URL hash.
        if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) {
              setError(error.message);
              return;
            }
            // Clean the hash from the URL so it doesn't leak into history.
            window.history.replaceState({}, "", window.location.pathname);
            router.replace(safeNext);
            router.refresh();
            return;
          }
        }

        // Neither flow matched — no usable credentials.
        setError("Enlace inválido o expirado.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado.");
      }
    }

    void finish();
  }, [code, next, router]);

  if (error) {
    return (
      <div
        role="alert"
        style={{
          marginTop: 14,
          padding: "10px 12px",
          background: "var(--warn-bg)",
          color: "var(--warn)",
          borderRadius: 8,
          fontSize: 12.5,
          textAlign: "left",
        }}
      >
        {error} ·{" "}
        <a href="/login" style={{ color: "inherit", textDecoration: "underline" }}>
          volver a login
        </a>
      </div>
    );
  }

  return null;
}
