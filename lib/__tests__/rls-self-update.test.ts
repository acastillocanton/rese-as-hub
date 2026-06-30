import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard de regresión del invariante de seguridad de `profiles_self_update`
 * (auditoría 2026-06-01, mig 021/022, CLAUDE.md §4.36).
 *
 * Un usuario NO debe poder auto-editar columnas sensibles de su perfil por API
 * directa (commission_rate → fraude, status → auto-reactivarse, director_id/
 * location_id → cambiarse de equipo/ficha, department → falsear el Excel…).
 *
 * Este test NO ejecuta RLS (no hay DB en los unit tests); lee la última
 * migración que define la policy y verifica que cada columna sensible se
 * compara contra su valor actual (subquery) en el WITH CHECK. Si alguien añade
 * una columna sensible a profiles y olvida congelarla, este test falla.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const FROZEN_COLUMNS = [
  "role",
  "slug",
  "previous_slug",
  "monthly_goal",
  "commission_rate",
  "commission_cap",
  "cross_location",
  "location_id",
  "director_id",
  "department",
  "language",
  "status",
];

function latestSelfUpdatePolicySql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let sql: string | null = null;
  for (const f of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    if (/create policy\s+profiles_self_update/i.test(content)) {
      sql = content; // la última por orden numérico de fichero gana
    }
  }
  if (!sql) {
    throw new Error("No hay migración que defina profiles_self_update");
  }
  return sql;
}

describe("RLS profiles_self_update (invariante de seguridad)", () => {
  const sql = latestSelfUpdatePolicySql();

  it.each(FROZEN_COLUMNS)(
    "congela la columna sensible '%s' contra su valor actual",
    (col) => {
      // La columna debe aparecer comparada contra una subconsulta (= o
      // is not distinct from (select ...)).
      const frozen = new RegExp(`\\b${col}\\b[\\s\\S]{0,90}?\\(\\s*select`, "i").test(sql);
      expect(
        frozen,
        `"${col}" no está congelada en profiles_self_update — ver CLAUDE.md §4.36`,
      ).toBe(true);
    },
  );

  it("permite la transición invited → active (flip de /auth/confirm)", () => {
    expect(/'invited'[\s\S]{0,120}?'active'/i.test(sql)).toBe(true);
  });
});
