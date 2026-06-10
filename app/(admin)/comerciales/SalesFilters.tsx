"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SalesDepartment } from "@/lib/supabase/types";

type LocationOption = { id: string; name: string };
type DirectorOption = { id: string; full_name: string; location_id: string | null };

type Props = {
  locations: LocationOption[];
  directors: DirectorOption[];
  current: {
    q?: string;
    location_id?: string;
    director_id?: string;
    department?: string;
    status?: string;
  };
};

const DEPARTMENT_LABELS: Record<SalesDepartment, string> = {
  nacional: "Nacional",
  internacional: "Internacional",
  castellon: "Castellón",
  valencia: "Valencia",
};

export function SalesFilters({ locations, directors, current }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [qInput, setQInput] = useState(current.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza el input cuando el server cambia el valor (ej. "Limpiar").
  useEffect(() => {
    setQInput(current.q ?? "");
  }, [current.q]);

  function push(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `/comerciales?${qs}` : "/comerciales");
  }

  function onQueryChange(value: string) {
    setQInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      push({ q: value.trim() || null });
    }, 250);
  }

  function onLocationChange(value: string) {
    // Si el director actual no pertenece a la nueva oficina, limpiarlo.
    const updates: Record<string, string | null> = { location_id: value || null };
    if (value && current.director_id) {
      const dir = directors.find((d) => d.id === current.director_id);
      if (dir && dir.location_id && dir.location_id !== value) {
        updates.director_id = null;
      }
    }
    push(updates);
  }

  // Si hay oficina, restringe los directores a esa oficina.
  const visibleDirectors = current.location_id
    ? directors.filter((d) => d.location_id === current.location_id)
    : directors;

  const hasFilters = Boolean(
    current.q || current.location_id || current.director_id || current.department || current.status,
  );

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <input
        type="search"
        value={qInput}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Buscar por nombre, email o slug…"
        aria-label="Buscar comerciales"
        style={{
          ...inputStyle,
          minWidth: 240,
          flex: "1 1 240px",
          maxWidth: 360,
        }}
      />

      <select
        value={current.location_id ?? ""}
        onChange={(e) => onLocationChange(e.target.value)}
        aria-label="Filtrar por oficina"
        style={selectStyle}
      >
        <option value="">Todas las oficinas</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <select
        value={current.director_id ?? ""}
        onChange={(e) => push({ director_id: e.target.value || null })}
        aria-label="Filtrar por director"
        style={selectStyle}
      >
        <option value="">Todos los directores</option>
        {visibleDirectors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.full_name}
          </option>
        ))}
      </select>

      <select
        value={current.department ?? ""}
        onChange={(e) => push({ department: e.target.value || null })}
        aria-label="Filtrar por departamento"
        style={selectStyle}
      >
        <option value="">Todos los departamentos</option>
        {(Object.keys(DEPARTMENT_LABELS) as SalesDepartment[]).map((d) => (
          <option key={d} value={d}>
            {DEPARTMENT_LABELS[d]}
          </option>
        ))}
      </select>

      <select
        value={current.status ?? ""}
        onChange={(e) => push({ status: e.target.value || null })}
        aria-label="Filtrar por estado"
        style={selectStyle}
      >
        <option value="">En plantilla</option>
        <option value="all">Todos</option>
        <option value="invited">Invitados</option>
        <option value="active">Activos</option>
        <option value="paused">Pausados</option>
        <option value="archived">Archivados</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() =>
            push({
              q: null,
              location_id: null,
              director_id: null,
              department: null,
              status: null,
            })
          }
          style={clearBtnStyle}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "7px 12px",
  border: "1px solid var(--line-strong)",
  borderRadius: 9,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--ink)",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  paddingRight: 28,
};

const clearBtnStyle: React.CSSProperties = {
  padding: "7px 12px",
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: 9,
  fontSize: 12.5,
  color: "var(--ink-3)",
  cursor: "pointer",
  fontFamily: "inherit",
};
