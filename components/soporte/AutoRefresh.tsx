"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresca la página periódicamente para mostrar nuevos mensajes.
 *  Lightweight polling — sin WebSockets, sin Supabase Realtime.
 *  El intervalo por defecto es 15 segundos. */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
