import { describe, expect, it } from "vitest";
import {
  buildMapsReviewUrl,
  cidFromFid,
  extractFidFromHtml,
  innerFromReviewToken,
} from "@/lib/google/maps-ugc";

// Caso real verificado E2E (Oropesa / reseña de Lisset Miguel, 2026-06-11).
const TOKEN =
  "Ci9DQUlRQUNvZENodHljRjlvT2tjeVdYVkNlR28wTkd0SFNqSkRjbWR5VFRCVFdXYxAB";
const FID = "0xd60489fe4101153:0xe9174fc12c1908e8";
const INNER = "CAIQACodChtycF9oOkcyWXVCeGo0NGtHSjJDcmdyTTBTWWc";
const EXPECTED_URL =
  "https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!2m5!1s" +
  TOKEN +
  "!2m1!1s0x0:0xe9174fc12c1908e8!3m1!1s2@1:" +
  INNER +
  "%7C%7C";

describe("extractFidFromHtml", () => {
  it("devuelve el FID más frecuente del HTML", () => {
    const html = `foo 0xd60489fe4101153:0xe9174fc12c1908e8 bar 0xd60489fe4101153:0xe9174fc12c1908e8 baz 0xaaa111:0xbbb222`;
    expect(extractFidFromHtml(html)).toBe("0xd60489fe4101153:0xe9174fc12c1908e8");
  });
  it("null si no hay ningún FID", () => {
    expect(extractFidFromHtml("sin feature id aquí")).toBeNull();
  });
});

describe("cidFromFid", () => {
  it("extrae la segunda mitad sin 0x", () => {
    expect(cidFromFid(FID)).toBe("e9174fc12c1908e8");
  });
  it("null para formato inválido o vacío", () => {
    expect(cidFromFid(null)).toBeNull();
    expect(cidFromFid("0xsolouno")).toBeNull();
    expect(cidFromFid("0xaaa:0xZZZ")).toBeNull();
  });
});

describe("innerFromReviewToken", () => {
  it("decodifica el INNER del data-review-id", () => {
    expect(innerFromReviewToken(TOKEN)).toBe(INNER);
  });
  it("null si el prefijo protobuf no es el esperado", () => {
    // base64 de bytes que no empiezan por 0x0a
    expect(innerFromReviewToken(Buffer.from([0x12, 0x03, 1, 2, 3]).toString("base64"))).toBeNull();
  });
  it("null para base64 basura", () => {
    expect(innerFromReviewToken("!!!notb64!!!")).toBeNull();
  });
});

describe("buildMapsReviewUrl", () => {
  it("construye el deep-link exacto verificado E2E", () => {
    expect(buildMapsReviewUrl(TOKEN, FID)).toBe(EXPECTED_URL);
  });
  it("null si falta token", () => {
    expect(buildMapsReviewUrl(null, FID)).toBeNull();
    expect(buildMapsReviewUrl("", FID)).toBeNull();
  });
  it("null si falta o es inválido el FID", () => {
    expect(buildMapsReviewUrl(TOKEN, null)).toBeNull();
    expect(buildMapsReviewUrl(TOKEN, "0xsolouno")).toBeNull();
  });
  it("null si el token no decodifica", () => {
    expect(buildMapsReviewUrl("!!!notb64!!!", FID)).toBeNull();
  });
});
