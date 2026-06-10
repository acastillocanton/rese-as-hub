"use client";

import { useRouter } from "next/navigation";

type Props = {
  current: string | undefined;
  basePath: string;
};

export function StatusFilter({ current, basePath }: Props) {
  const router = useRouter();

  function onChange(value: string) {
    router.push(value ? `${basePath}?status=${value}` : basePath);
  }

  return (
    <select
      value={current ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por estado"
      style={{
        padding: "7px 12px",
        border: "1px solid var(--line-strong)",
        borderRadius: 9,
        fontSize: 13,
        fontFamily: "inherit",
        background: "var(--surface)",
        color: "var(--ink)",
        cursor: "pointer",
        paddingRight: 28,
      }}
    >
      <option value="">En plantilla</option>
      <option value="all">Todos</option>
      <option value="invited">Invitados</option>
      <option value="active">Activos</option>
      <option value="paused">Pausados</option>
      <option value="archived">Archivados</option>
    </select>
  );
}
