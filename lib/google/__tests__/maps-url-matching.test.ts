import { describe, expect, it } from "vitest";
import {
  matchUgcToReviews,
  type StoredReviewForMatch,
  type UgcReviewForMatch,
} from "@/lib/google/maps-url-matching";

const T = "2026-05-10T12:00:00.000Z";
const TMS = new Date(T).getTime();

const stored = (over: Partial<StoredReviewForMatch> = {}): StoredReviewForMatch => ({
  id: "r1",
  authorName: "María García",
  rating: 5,
  createdAtIso: T,
  ...over,
});
const ugc = (over: Partial<UgcReviewForMatch> = {}): UgcReviewForMatch => ({
  url: "https://maps.app.goo.gl/AAA",
  authorName: "María García",
  rating: 5,
  createdAtMs: TMS,
  ...over,
});

describe("matchUgcToReviews", () => {
  it("match único 1↔1 con autor+rating+fecha → url + confidence exact", () => {
    const [m] = matchUgcToReviews([stored()], [ugc()]);
    expect(m).toEqual({ reviewId: "r1", url: "https://maps.app.goo.gl/AAA", confidence: "exact" });
  });

  it("tolera nombre con tokens contenidos (autor con apellido extra)", () => {
    const [m] = matchUgcToReviews(
      [stored({ authorName: "Salvador Sanchis" })],
      [ugc({ authorName: "Salvador Sanchis Plaus" })],
    );
    expect(m).toMatchObject({ reviewId: "r1", url: "https://maps.app.goo.gl/AAA" });
  });

  it("rating distinto → no casa (no_candidate)", () => {
    const [m] = matchUgcToReviews([stored({ rating: 1 })], [ugc({ rating: 5 })]);
    expect(m).toEqual({ reviewId: "r1", skipped: "no_candidate" });
  });

  it("fuera de la guarda laxa (>31 días) → no casa", () => {
    const [m] = matchUgcToReviews(
      [stored()],
      [ugc({ createdAtMs: TMS + 60 * 24 * 3600 * 1000 })],
    );
    expect(m).toEqual({ reviewId: "r1", skipped: "no_candidate" });
  });

  it("diferencia >1h pero dentro de 31 días → strong (no exact)", () => {
    const [m] = matchUgcToReviews(
      [stored()],
      [ugc({ createdAtMs: TMS + 5 * 24 * 3600 * 1000 })],
    );
    expect(m).toMatchObject({ confidence: "strong" });
  });

  it("fecha nula (DOM solo da relativa) → casa por autor+rating, confidence strong", () => {
    const [m] = matchUgcToReviews([stored()], [ugc({ createdAtMs: null })]);
    expect(m).toEqual({ reviewId: "r1", url: "https://maps.app.goo.gl/AAA", confidence: "strong" });
  });

  it("anónimo → skip sin intentar casar", () => {
    const [m] = matchUgcToReviews(
      [stored({ authorName: "Anónimo" })],
      [ugc({ authorName: "Anónimo" })],
    );
    expect(m).toEqual({ reviewId: "r1", skipped: "anonymous" });
  });

  it("dos ugc candidatos para una fila (homónimos misma fecha) → ambiguo, no casa", () => {
    const [m] = matchUgcToReviews(
      [stored()],
      [ugc({ url: "u1" }), ugc({ url: "u2" })],
    );
    expect(m).toEqual({ reviewId: "r1", skipped: "ambiguous_multiple_ugc" });
  });

  it("un ugc que casa con dos filas (homónimos en BD) → ambiguo en ambas", () => {
    const res = matchUgcToReviews(
      [stored({ id: "a" }), stored({ id: "b" })],
      [ugc()],
    );
    expect(res).toEqual([
      { reviewId: "a", skipped: "ambiguous_shared_ugc" },
      { reviewId: "b", skipped: "ambiguous_shared_ugc" },
    ]);
  });

  it("varias reseñas distintas casan cada una con su ugc", () => {
    const res = matchUgcToReviews(
      [
        stored({ id: "a", authorName: "Ana López", rating: 5 }),
        stored({ id: "b", authorName: "Beto Ruiz", rating: 4 }),
      ],
      [
        ugc({ url: "ua", authorName: "Ana López", rating: 5 }),
        ugc({ url: "ub", authorName: "Beto Ruiz", rating: 4 }),
      ],
    );
    expect(res).toEqual([
      { reviewId: "a", url: "ua", confidence: "exact" },
      { reviewId: "b", url: "ub", confidence: "exact" },
    ]);
  });

  it("nombre demasiado distinto (solo apellido) → no casa", () => {
    const [m] = matchUgcToReviews(
      [stored({ authorName: "María García" })],
      [ugc({ authorName: "S. García" })],
    );
    expect(m).toEqual({ reviewId: "r1", skipped: "no_candidate" });
  });

  it("createdAtIso inválido → no casa (defensivo)", () => {
    const [m] = matchUgcToReviews([stored({ createdAtIso: "no-date" })], [ugc()]);
    expect(m).toEqual({ reviewId: "r1", skipped: "no_candidate" });
  });
});
