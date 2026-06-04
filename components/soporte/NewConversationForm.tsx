"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { createConversation } from "@/app/(profile)/soporte/actions";
import type { SupportCategory } from "@/lib/supabase/types";

type ReviewOption = { id: string; label: string };
type ClientOption = { id: string; label: string };

type NewConversationFormProps = {
  reviews?: ReviewOption[];
  clients?: ClientOption[];
};

const CATEGORY_OPTIONS: { value: SupportCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "review_question", label: "Sobre una reseña" },
  { value: "technical", label: "Problema técnico" },
  { value: "billing", label: "Comisiones / pagos" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--line-strong)",
  borderRadius: 9,
  fontSize: 14,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--ink)",
};

export function NewConversationForm({ reviews, clients }: NewConversationFormProps) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("general");
  const [body, setBody] = useState("");
  const [linkedReviewId, setLinkedReviewId] = useState<string | null>(null);
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const canSubmit = subject.trim().length >= 3 && body.trim().length >= 1 && !isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await createConversation({
        subject: subject.trim(),
        body: body.trim(),
        category,
        linkedReviewId: linkedReviewId || null,
        linkedClientId: linkedClientId || null,
      });
      if (res.ok) {
        router.push(`/soporte/${res.conversationId}`);
      } else {
        alert(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}
    >
      {/* Subject */}
      <div>
        <label
          htmlFor="subject"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--ink)" }}
        >
          Asunto
        </label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Describe brevemente tu consulta"
          maxLength={200}
          required
          style={inputStyle}
        />
      </div>

      {/* Category */}
      <div>
        <label
          htmlFor="category"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--ink)" }}
        >
          Categoría
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as SupportCategory)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Linked review */}
      {reviews && reviews.length > 0 && (
        <div>
          <label
            htmlFor="linkedReview"
            style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--ink)" }}
          >
            Vincular reseña <span style={{ fontWeight: 400, color: "var(--ink-4)" }}>(opcional)</span>
          </label>
          <select
            id="linkedReview"
            value={linkedReviewId ?? ""}
            onChange={(e) => {
              setLinkedReviewId(e.target.value || null);
              if (e.target.value) setLinkedClientId(null);
            }}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">Ninguna</option>
            {reviews.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Linked client */}
      {clients && clients.length > 0 && (
        <div>
          <label
            htmlFor="linkedClient"
            style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--ink)" }}
          >
            Vincular cliente <span style={{ fontWeight: 400, color: "var(--ink-4)" }}>(opcional)</span>
          </label>
          <select
            id="linkedClient"
            value={linkedClientId ?? ""}
            onChange={(e) => {
              setLinkedClientId(e.target.value || null);
              if (e.target.value) setLinkedReviewId(null);
            }}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">Ninguno</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Body */}
      <div>
        <label
          htmlFor="body"
          style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--ink)" }}
        >
          Mensaje
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Explica tu consulta en detalle..."
          rows={5}
          maxLength={5000}
          required
          style={{ ...inputStyle, resize: "vertical", minHeight: 120 }}
        />
      </div>

      {/* Submit */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <GhostBtn type="submit" primary disabled={!canSubmit}>
          {isPending ? "Enviando..." : "Enviar consulta"}
        </GhostBtn>
        <GhostBtn type="button" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </GhostBtn>
      </div>
    </form>
  );
}
