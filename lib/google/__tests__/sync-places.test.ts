import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests de la lógica de soft-delete del syncPlaces. Como la función real
 * tiene I/O contra Supabase, aquí probamos la "kernel logic": qué se decide
 * con qué entrada. Mockeamos un cliente Supabase mínimo y comprobamos los
 * efectos esperados.
 */

// El cliente Supabase mockeado guarda las llamadas para que las podamos
// verificar después.
type Capture = {
  selectFilters: Array<Record<string, unknown>>;
  updates: Array<{ filter: Record<string, unknown>; values: Record<string, unknown> }>;
  selectResult: Array<{ id: string; google_review_id: string; removed_at: string | null }>;
};

function makeMockAdmin(capture: Capture) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          const chain = {
            _filters: {} as Record<string, unknown>,
            eq(col: string, val: unknown) {
              this._filters[`eq:${col}`] = val;
              return this;
            },
            like(col: string, val: unknown) {
              this._filters[`like:${col}`] = val;
              return this;
            },
            gte(col: string, val: unknown) {
              this._filters[`gte:${col}`] = val;
              return this;
            },
            returns() {
              capture.selectFilters.push({ ...this._filters });
              return Promise.resolve({ data: capture.selectResult, error: null });
            },
          };
          return chain;
        },
        update(values: Record<string, unknown>) {
          return {
            _values: values,
            _filter: {} as Record<string, unknown>,
            in(col: string, val: unknown) {
              this._filter[`in:${col}`] = val;
              capture.updates.push({ filter: { ...this._filter }, values: this._values });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

// Importación tardía para que el mock esté listo
let reconcileRemoved: (
  admin: any,
  locationId: string,
  placesReviews: Array<{ google_review_id: string; google_created_at: string }>,
) => Promise<{ removed: number; restored: number }>;

beforeEach(async () => {
  // El módulo no exporta reconcileRemoved (es interno). Le hacemos un
  // re-import dinámico extrayendo la función a través del SUT real no es
  // trivial sin exportarla. Para mantenerlo limpio, exportamos el helper
  // como named export desde sync-places.ts.
  const mod = await import("../sync-places");
  // @ts-expect-error — la función se exporta para tests
  reconcileRemoved = mod.__test_reconcileRemoved;
});

describe("reconcileRemoved", () => {
  const LOC = "loc-1";
  const place = (id: string, daysAgo: number) => ({
    google_review_id: id,
    google_created_at: new Date(Date.now() - daysAgo * 86400_000).toISOString(),
  });

  it("no toca nada si Places devuelve 0 reseñas", async () => {
    const capture: Capture = { selectFilters: [], updates: [], selectResult: [] };
    const admin = makeMockAdmin(capture);
    const out = await reconcileRemoved(admin, LOC, []);
    expect(out).toEqual({ removed: 0, restored: 0 });
    expect(capture.selectFilters).toHaveLength(0);
  });

  it("marca como eliminada una reseña en BD que ya no aparece en Places", async () => {
    const capture: Capture = {
      selectFilters: [],
      updates: [],
      selectResult: [
        { id: "row-A", google_review_id: "places:X", removed_at: null },
        { id: "row-B", google_review_id: "places:Y", removed_at: null }, // esta ya no está en Places
      ],
    };
    const admin = makeMockAdmin(capture);
    const out = await reconcileRemoved(admin, LOC, [
      place("places:X", 5),
      place("places:Z", 1),
    ]);
    expect(out.removed).toBe(1);
    expect(out.restored).toBe(0);
    expect(capture.updates).toHaveLength(1);
    expect(capture.updates[0]!.filter["in:id"]).toEqual(["row-B"]);
    expect(capture.updates[0]!.values).toHaveProperty("removed_at");
    expect(capture.updates[0]!.values.removed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    );
  });

  it("restaura una reseña previamente marcada que vuelve a aparecer", async () => {
    const capture: Capture = {
      selectFilters: [],
      updates: [],
      selectResult: [
        { id: "row-A", google_review_id: "places:X", removed_at: "2026-01-01T00:00:00Z" },
      ],
    };
    const admin = makeMockAdmin(capture);
    const out = await reconcileRemoved(admin, LOC, [place("places:X", 1)]);
    expect(out.restored).toBe(1);
    expect(out.removed).toBe(0);
    expect(capture.updates).toHaveLength(1);
    expect(capture.updates[0]!.values).toEqual({ removed_at: null });
  });

  it("no toca reseñas con prefijo manual: (no son responsabilidad de Places)", async () => {
    const capture: Capture = {
      selectFilters: [],
      updates: [],
      // El query del helper filtra por LIKE 'places:%'. Si el mock devuelve
      // solo reseñas manuales, simula que el LIKE las excluyó.
      selectResult: [],
    };
    const admin = makeMockAdmin(capture);
    const out = await reconcileRemoved(admin, LOC, [place("places:X", 1)]);
    expect(out).toEqual({ removed: 0, restored: 0 });
    // Verificamos que se aplicó el filtro por prefijo
    expect(capture.selectFilters[0]!["like:google_review_id"]).toBe("places:%");
  });

  it("no marca ni restaura nada si todo está en orden", async () => {
    const capture: Capture = {
      selectFilters: [],
      updates: [],
      selectResult: [
        { id: "A", google_review_id: "places:X", removed_at: null },
        { id: "B", google_review_id: "places:Y", removed_at: null },
      ],
    };
    const admin = makeMockAdmin(capture);
    const out = await reconcileRemoved(admin, LOC, [
      place("places:X", 1),
      place("places:Y", 2),
    ]);
    expect(out).toEqual({ removed: 0, restored: 0 });
    expect(capture.updates).toHaveLength(0);
  });
});
