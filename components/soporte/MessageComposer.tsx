"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { sendMessage } from "@/app/(profile)/soporte/actions";

type MessageComposerProps = {
  conversationId: string;
  disabled?: boolean;
};

export function MessageComposer({ conversationId, disabled }: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const canSend = body.trim().length > 0 && !isPending && !disabled;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const text = body.trim();
    setBody("");
    startTransition(async () => {
      const res = await sendMessage({ conversationId, body: text });
      if (!res.ok) {
        setBody(text); // Restore on failure
        alert(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        padding: "14px 0 0",
        borderTop: "1px solid var(--line)",
        marginTop: 16,
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={disabled ? "Conversación cerrada" : "Escribe tu mensaje..."}
        disabled={disabled || isPending}
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        style={{
          flex: 1,
          minHeight: 44,
          maxHeight: 160,
          padding: "10px 14px",
          border: "1px solid var(--line-strong)",
          borderRadius: 10,
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
          background: disabled ? "var(--bg)" : "var(--surface)",
          color: "var(--ink)",
        }}
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Enviar mensaje"
        style={{
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          border: "none",
          borderRadius: 10,
          background: canSend ? "var(--ink)" : "var(--line)",
          color: canSend ? "#fff" : "var(--ink-4)",
          cursor: canSend ? "pointer" : "default",
          flexShrink: 0,
        }}
      >
        <Send size={18} />
      </button>
    </form>
  );
}
