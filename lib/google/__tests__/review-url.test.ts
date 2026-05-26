import { describe, expect, it } from "vitest";
import { buildGoogleReviewListUrl } from "@/lib/google/review-url";

describe("buildGoogleReviewListUrl", () => {
  it("devuelve la URL pública de Google con el placeId codificado", () => {
    expect(buildGoogleReviewListUrl("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(
      "https://search.google.com/local/reviews?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
    );
  });

  it("encode-uri-componenta caracteres especiales en el placeId", () => {
    // Google place_ids no contienen caracteres especiales en la práctica,
    // pero el helper debe sanear igual por defensa.
    expect(buildGoogleReviewListUrl("abc/def&ghi=jkl")).toBe(
      "https://search.google.com/local/reviews?placeid=abc%2Fdef%26ghi%3Djkl",
    );
  });

  it("devuelve null cuando placeId es null", () => {
    expect(buildGoogleReviewListUrl(null)).toBeNull();
  });

  it("devuelve null cuando placeId es undefined", () => {
    expect(buildGoogleReviewListUrl(undefined)).toBeNull();
  });

  it("devuelve null cuando placeId es string vacío", () => {
    expect(buildGoogleReviewListUrl("")).toBeNull();
  });
});
