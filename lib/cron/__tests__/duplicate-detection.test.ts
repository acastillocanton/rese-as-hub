import { describe, expect, it } from "vitest";
import { decideFromPrincipals } from "@/lib/cron/duplicate-detection";

describe("decideFromPrincipals", () => {
  it("returns newIsDuplicate=false when there's no principal previa", () => {
    const r = decideFromPrincipals([], "2026-05-26T10:00:00Z");
    expect(r).toEqual({ newIsDuplicate: false, demotedReviewId: null });
  });

  it("marca duplicada cuando la entrante es posterior a la principal", () => {
    const r = decideFromPrincipals(
      [{ id: "p1", google_created_at: "2026-05-26T10:00:00Z" }],
      "2026-05-26T11:00:00Z",
    );
    expect(r).toEqual({ newIsDuplicate: true, demotedReviewId: null });
  });

  it("invierte cuando la entrante es más antigua que la principal", () => {
    const r = decideFromPrincipals(
      [{ id: "p1", google_created_at: "2026-05-26T11:00:00Z" }],
      "2026-05-26T10:00:00Z",
    );
    expect(r).toEqual({ newIsDuplicate: false, demotedReviewId: "p1" });
  });

  it("empate exacto: la entrante se marca duplicada (la previa mantiene principal)", () => {
    const r = decideFromPrincipals(
      [{ id: "p1", google_created_at: "2026-05-26T10:00:00Z" }],
      "2026-05-26T10:00:00Z",
    );
    expect(r).toEqual({ newIsDuplicate: true, demotedReviewId: null });
  });

  it("estado inconsistente (varias principales): compara contra la MÁS antigua", () => {
    const r = decideFromPrincipals(
      [
        { id: "p2", google_created_at: "2026-05-26T12:00:00Z" },
        { id: "p1", google_created_at: "2026-05-26T08:00:00Z" },
        { id: "p3", google_created_at: "2026-05-26T15:00:00Z" },
      ],
      "2026-05-26T09:00:00Z", // entre p1 y p2
    );
    // La entrante (09:00) es posterior a la más antigua (08:00) → duplicada.
    expect(r).toEqual({ newIsDuplicate: true, demotedReviewId: null });
  });

  it("estado inconsistente (varias principales): si entrante < más antigua, demota la más antigua", () => {
    const r = decideFromPrincipals(
      [
        { id: "p2", google_created_at: "2026-05-26T12:00:00Z" },
        { id: "p1", google_created_at: "2026-05-26T08:00:00Z" },
      ],
      "2026-05-26T07:00:00Z",
    );
    expect(r).toEqual({ newIsDuplicate: false, demotedReviewId: "p1" });
  });

  it("flujo del cron: 3 reseñas mismo client_id en orden cronológico (simulado iterativamente)", () => {
    // Caso real: el cron procesa 3 reseñas para Pepe (client_id="c1") con
    // google_created_at 10:00, 11:00, 12:00. Simulamos las decisiones que
    // tomaría process-reviews.ts antes de cada INSERT.
    let principals: { id: string; google_created_at: string }[] = [];

    const r1 = decideFromPrincipals(principals, "2026-05-26T10:00:00Z");
    expect(r1.newIsDuplicate).toBe(false);
    // Tras insertar la 1ª como principal:
    principals = [{ id: "rev1", google_created_at: "2026-05-26T10:00:00Z" }];

    const r2 = decideFromPrincipals(principals, "2026-05-26T11:00:00Z");
    expect(r2.newIsDuplicate).toBe(true);
    expect(r2.demotedReviewId).toBeNull();
    // La 2ª entra como duplicada — principals no cambia.

    const r3 = decideFromPrincipals(principals, "2026-05-26T12:00:00Z");
    expect(r3.newIsDuplicate).toBe(true);
    expect(r3.demotedReviewId).toBeNull();
  });

  it("flujo del cron: misma situación pero las reseñas llegan en orden inverso (Places trae histórico)", () => {
    let principals: { id: string; google_created_at: string }[] = [];

    // Primero entra la más reciente (12:00) — es la única, queda principal.
    const r1 = decideFromPrincipals(principals, "2026-05-26T12:00:00Z");
    expect(r1.newIsDuplicate).toBe(false);
    principals = [{ id: "rev1", google_created_at: "2026-05-26T12:00:00Z" }];

    // Luego entra una de 11:00 — es más antigua → invierte: nueva principal,
    // rev1 demotada.
    const r2 = decideFromPrincipals(principals, "2026-05-26T11:00:00Z");
    expect(r2.newIsDuplicate).toBe(false);
    expect(r2.demotedReviewId).toBe("rev1");
    // Tras aplicar el cambio (process-reviews demota rev1 y promueve rev2):
    principals = [{ id: "rev2", google_created_at: "2026-05-26T11:00:00Z" }];

    // Finalmente entra una de 10:00 — vuelve a invertir.
    const r3 = decideFromPrincipals(principals, "2026-05-26T10:00:00Z");
    expect(r3.newIsDuplicate).toBe(false);
    expect(r3.demotedReviewId).toBe("rev2");
  });
});
