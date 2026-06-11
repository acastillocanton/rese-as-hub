import { describe, expect, it } from "vitest";
import { mapPlaceNewReview } from "@/lib/google/places-new";

describe("mapPlaceNewReview", () => {
  it("mapea una reseña completa con googleMapsUri", () => {
    const m = mapPlaceNewReview({
      name: "places/ChIJabc/reviews/AbFvOqm",
      rating: 5,
      text: { text: "Genial", languageCode: "es" },
      authorAttribution: { displayName: "Lisset Miguel" },
      publishTime: "2025-10-01T10:00:00Z",
      googleMapsUri: "https://www.google.com/maps/reviews/data=!abc",
    });
    expect(m).toEqual({
      mapsUri: "https://www.google.com/maps/reviews/data=!abc",
      author: "Lisset Miguel",
      hasAuthorName: true,
      rating: 5,
      text: "Genial",
      publishTimeMs: Date.parse("2025-10-01T10:00:00Z"),
      name: "places/ChIJabc/reviews/AbFvOqm",
    });
  });

  it("null si no hay googleMapsUri (sin enlace no sirve)", () => {
    expect(
      mapPlaceNewReview({ rating: 5, authorAttribution: { displayName: "X" } }),
    ).toBeNull();
  });

  it("null si el rating está fuera de rango", () => {
    expect(
      mapPlaceNewReview({ rating: 0, googleMapsUri: "https://g/r" }),
    ).toBeNull();
    expect(
      mapPlaceNewReview({ rating: 6, googleMapsUri: "https://g/r" }),
    ).toBeNull();
  });

  it("marca anónimo y deja publishTimeMs null si falta o es inválida la fecha", () => {
    const m = mapPlaceNewReview({
      rating: 4,
      authorAttribution: { displayName: "A Google User" },
      googleMapsUri: "https://g/r",
    });
    expect(m?.author).toBe("Anónimo");
    expect(m?.hasAuthorName).toBe(false);
    expect(m?.publishTimeMs).toBeNull();
    expect(m?.text).toBeNull();
  });

  it("redondea rating decimal y cae a originalText si no hay text", () => {
    const m = mapPlaceNewReview({
      rating: 4.0,
      originalText: { text: "Original" },
      authorAttribution: { displayName: "Pep" },
      googleMapsUri: "https://g/r",
    });
    expect(m?.rating).toBe(4);
    expect(m?.text).toBe("Original");
  });
});
