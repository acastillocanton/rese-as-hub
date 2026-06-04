import type { SupportCategory } from "@/lib/supabase/types";

const CATEGORY_CONFIG: Record<SupportCategory, { label: string; bg: string; color: string }> = {
  general: { label: "General", bg: "#f0f0f0", color: "#555" },
  review_question: { label: "Reseña", bg: "#eef2ff", color: "#4338ca" },
  technical: { label: "Técnico", bg: "#fef3c7", color: "#92400e" },
  billing: { label: "Comisiones", bg: "#ecfdf5", color: "#065f46" },
};

export function categoryLabel(category: SupportCategory): string {
  return CATEGORY_CONFIG[category]?.label ?? category;
}

export function CategoryPill({ category }: { category: SupportCategory }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.general;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}
