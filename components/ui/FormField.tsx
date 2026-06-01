import type { CSSProperties, ReactNode } from "react";

/**
 * Estilo de input estándar de los formularios de alta/edición. Antes estaba
 * duplicado byte a byte en cada modal (InviteSales/Director/Manager,
 * NewClient, AddFicha…).
 */
export const formInputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "var(--surface)",
  border: "1px solid var(--line-strong)",
  borderRadius: 9,
  fontSize: 13,
  color: "var(--ink)",
};

/**
 * Campo de formulario: etiqueta en mayúsculas + control + hint opcional.
 * Componente presentacional (sin hooks) → válido en server y client.
 */
export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
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
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-4)" }}>{hint}</div>
      )}
    </div>
  );
}
