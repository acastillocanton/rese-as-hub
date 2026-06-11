import { describe, expect, it } from "vitest";
import {
  buildGoogleReviewListUrl,
  buildGoogleReviewUrl,
  isDeepReviewUrl,
  isMapsShortShareUrl,
  isMapsShareUrlInput,
} from "@/lib/google/review-url";

const DEEP =
  "https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!2m5!1sCi9DQUlR!2m1!1s0x0:0xe9174fc12c1908e8!3m1!1s2@1:CAIQ";

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

describe("buildGoogleReviewUrl (degradación deep-link → lista)", () => {
  it("prioriza el deep-link cuando hay mapsUrl", () => {
    expect(buildGoogleReviewUrl({ mapsUrl: DEEP, placeId: "ChIJabc" })).toBe(DEEP);
  });

  it("cae a la lista de la ficha cuando no hay mapsUrl", () => {
    expect(buildGoogleReviewUrl({ mapsUrl: null, placeId: "ChIJabc" })).toBe(
      "https://search.google.com/local/reviews?placeid=ChIJabc",
    );
  });

  it("ignora mapsUrl en blanco y cae a la lista", () => {
    expect(buildGoogleReviewUrl({ mapsUrl: "   ", placeId: "ChIJabc" })).toBe(
      "https://search.google.com/local/reviews?placeid=ChIJabc",
    );
  });

  it("devuelve null cuando no hay ni deep-link ni place_id", () => {
    expect(buildGoogleReviewUrl({ mapsUrl: null, placeId: null })).toBeNull();
    expect(buildGoogleReviewUrl({})).toBeNull();
  });
});

describe("isDeepReviewUrl", () => {
  it("true para deep-links de reseña", () => {
    expect(isDeepReviewUrl(DEEP)).toBe(true);
  });
  it("false para el enlace de lista o vacío", () => {
    expect(isDeepReviewUrl("https://search.google.com/local/reviews?placeid=x")).toBe(false);
    expect(isDeepReviewUrl(null)).toBe(false);
    expect(isDeepReviewUrl(undefined)).toBe(false);
  });
});

describe("isMapsShortShareUrl", () => {
  it("true para enlaces cortos de compartir", () => {
    expect(isMapsShortShareUrl("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isMapsShortShareUrl("https://goo.gl/maps/xyz")).toBe(true);
  });
  it("false para deep-link directo, lista u otros hosts", () => {
    expect(isMapsShortShareUrl(DEEP)).toBe(false);
    expect(isMapsShortShareUrl("https://evil.com/maps.app.goo.gl/x")).toBe(false);
    expect(isMapsShortShareUrl(null)).toBe(false);
  });
});

describe("isMapsShareUrlInput (acepta deep-link o corto)", () => {
  it("true para deep-link y para corto", () => {
    expect(isMapsShareUrlInput(DEEP)).toBe(true);
    expect(isMapsShareUrlInput("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
  });
  it("false para basura o enlace de lista", () => {
    expect(isMapsShareUrlInput("https://search.google.com/local/reviews?placeid=x")).toBe(false);
    expect(isMapsShareUrlInput("ftp://nope")).toBe(false);
    expect(isMapsShareUrlInput("")).toBe(false);
  });
});
