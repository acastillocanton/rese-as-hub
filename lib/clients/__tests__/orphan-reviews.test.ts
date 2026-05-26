import { describe, expect, it } from "vitest";
import {
  ORPHAN_SUGGEST_THRESHOLD,
  scoreOrphanCandidates,
  type OrphanReviewInput,
} from "@/lib/clients/orphan-reviews";

function mkReview(
  id: string,
  author_name: string,
  google_created_at = "2026-05-26T10:00:00Z",
  rating = 5,
): OrphanReviewInput {
  return { id, author_name, google_created_at, rating };
}

describe("scoreOrphanCandidates", () => {
  it("devuelve vacío si no hay reseñas", () => {
    expect(scoreOrphanCandidates("Salvador Sanchis", [])).toEqual([]);
  });

  it("devuelve vacío si el nombre del cliente está vacío", () => {
    expect(scoreOrphanCandidates("", [mkReview("r1", "Salvador Sanchis")])).toEqual([]);
  });

  it("matchea el caso real Salvador Sanchis vs Salvador Sanchis Plaus", () => {
    // El cliente real tenía full_name "salvador sanchis", la reseña venía
    // con autor "Salvador Sanchis Plaus" → match=90 (tokens del cliente
    // contenidos en el autor).
    const out = scoreOrphanCandidates("salvador sanchis", [
      mkReview("r1", "Salvador Sanchis Plaus"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("r1");
    expect(out[0]?.similarity).toBeGreaterThanOrEqual(ORPHAN_SUGGEST_THRESHOLD);
  });

  it("filtra las que están por debajo del threshold", () => {
    const out = scoreOrphanCandidates("Salvador Sanchis", [
      mkReview("r1", "Juan García"),
      mkReview("r2", "Pedro Martín"),
    ]);
    expect(out).toEqual([]);
  });

  it("ordena por similarity desc", () => {
    const out = scoreOrphanCandidates("Salvador Sanchis", [
      mkReview("r-low", "Salvador López"), // primer nombre coincide → 55
      mkReview("r-exact", "Salvador Sanchis"), // exact → 100
      mkReview("r-high", "Salvador Sanchis Plaus"), // tokens contenidos → 90
    ]);
    expect(out.map((c) => c.id)).toEqual(["r-exact", "r-high", "r-low"]);
  });

  it("desempata por google_created_at desc cuando similarity es igual", () => {
    const out = scoreOrphanCandidates("Salvador Sanchis", [
      mkReview("r-old", "Salvador Sanchis", "2026-05-01T10:00:00Z"),
      mkReview("r-new", "Salvador Sanchis", "2026-05-26T10:00:00Z"),
    ]);
    expect(out.map((c) => c.id)).toEqual(["r-new", "r-old"]);
  });

  it("limita a top 5 candidatas", () => {
    const reviews = Array.from({ length: 10 }, (_, i) =>
      mkReview(`r${i}`, "Salvador Sanchis Plaus"),
    );
    const out = scoreOrphanCandidates("Salvador Sanchis", reviews);
    expect(out).toHaveLength(5);
  });

  it("conserva metadata de la reseña en el output", () => {
    const out = scoreOrphanCandidates("Salvador Sanchis", [
      mkReview("r1", "Salvador Sanchis Plaus", "2026-05-26T10:00:00Z", 4),
    ]);
    expect(out[0]).toMatchObject({
      id: "r1",
      author_name: "Salvador Sanchis Plaus",
      rating: 4,
      google_created_at: "2026-05-26T10:00:00Z",
    });
  });

  it("matchea inicial + primer nombre (S. Sanchis vs Salvador Sanchis)", () => {
    // "S. Sanchis" → tokens ["s", "sanchis"]. Cliente "Salvador Sanchis"
    // → ["salvador", "sanchis"]. Primer nombre no coincide (s vs
    // salvador), intersection = ["sanchis"] → return 30 (debajo del 50).
    // Por diseño actual NO sugerimos en este caso — el cliente decide
    // manualmente desde verificación.
    const out = scoreOrphanCandidates("Salvador Sanchis", [
      mkReview("r1", "S. Sanchis"),
    ]);
    expect(out).toEqual([]);
  });

  it("ignora reseñas con autor totalmente distinto al cliente", () => {
    const out = scoreOrphanCandidates("Salvador Sanchis", [
      mkReview("r-match", "Salvador Sanchis Plaus"),
      mkReview("r-no", "Persona Ajena"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("r-match");
  });
});
