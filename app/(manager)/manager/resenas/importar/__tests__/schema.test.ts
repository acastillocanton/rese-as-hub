import { describe, it, expect } from "vitest";
import {
  importManualReviewSchema,
  looksAnonymous,
  toIsoUtc,
} from "../schema";

const VALID_LOC = "11111111-1111-1111-1111-111111111111";
const VALID_SALES = "22222222-2222-2222-2222-222222222222";
const VALID_CLIENT = "33333333-3333-3333-3333-333333333333";

describe("importManualReviewSchema", () => {
  it("acepta el caso mínimo sin atribución forzada", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "Antonio Ramírez",
      rating: 5,
      text: null,
      googleCreatedAt: "2026-05-20T12:00",
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.text).toBeNull();
      expect(out.data.forcedSalesId).toBeNull();
      expect(out.data.forcedClientId).toBeNull();
    }
  });

  it("transforma forcedSalesId vacío a null", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "Antonio",
      rating: 4,
      text: null,
      googleCreatedAt: "2026-05-20T12:00",
      forcedSalesId: null,
      forcedClientId: null,
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.forcedSalesId).toBeNull();
      expect(out.data.forcedClientId).toBeNull();
    }
  });

  it("recorta el texto y vacíos → null", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "Antonio",
      rating: 3,
      text: "   ",
      googleCreatedAt: "2026-05-20T12:00",
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.text).toBeNull();
  });

  it("rechaza locationId no uuid", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: "not-a-uuid",
      authorName: "Antonio",
      rating: 5,
      text: null,
      googleCreatedAt: "2026-05-20T12:00",
    });
    expect(out.success).toBe(false);
  });

  it("rechaza rating < 1 y > 5", () => {
    const tooLow = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "X",
      rating: 0,
      text: null,
      googleCreatedAt: "2026-05-20T12:00",
    });
    const tooHigh = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "X",
      rating: 6,
      text: null,
      googleCreatedAt: "2026-05-20T12:00",
    });
    expect(tooLow.success).toBe(false);
    expect(tooHigh.success).toBe(false);
  });

  it("rating string '4' se coacciona a 4", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "Antonio",
      rating: "4",
      text: null,
      googleCreatedAt: "2026-05-20T12:00",
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.rating).toBe(4);
  });

  it("rechaza authorName vacío", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "",
      rating: 5,
      text: null,
      googleCreatedAt: "2026-05-20T12:00",
    });
    expect(out.success).toBe(false);
  });

  it("rechaza googleCreatedAt no parseable", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "Antonio",
      rating: 5,
      text: null,
      googleCreatedAt: "no-es-una-fecha",
    });
    expect(out.success).toBe(false);
  });

  it("acepta atribución forzada con uuids válidos", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "Antonio",
      rating: 5,
      text: "Buen servicio",
      googleCreatedAt: "2026-05-20T12:00",
      forcedSalesId: VALID_SALES,
      forcedClientId: VALID_CLIENT,
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.forcedSalesId).toBe(VALID_SALES);
      expect(out.data.forcedClientId).toBe(VALID_CLIENT);
      expect(out.data.text).toBe("Buen servicio");
    }
  });

  it("rechaza texto > 5000 chars", () => {
    const out = importManualReviewSchema.safeParse({
      locationId: VALID_LOC,
      authorName: "Antonio",
      rating: 5,
      text: "x".repeat(5001),
      googleCreatedAt: "2026-05-20T12:00",
    });
    expect(out.success).toBe(false);
  });
});

describe("looksAnonymous", () => {
  it("detecta variantes del placeholder de Google", () => {
    expect(looksAnonymous("Anónimo")).toBe(true);
    expect(looksAnonymous("ANÓNIMO")).toBe(true);
    expect(looksAnonymous("anonimo")).toBe(true);
    expect(looksAnonymous("Un usuario de Google")).toBe(true);
    expect(looksAnonymous("A Google user")).toBe(true);
    expect(looksAnonymous("  Usuario de Google  ")).toBe(true);
    expect(looksAnonymous("")).toBe(true);
    expect(looksAnonymous("   ")).toBe(true);
  });

  it("no marca como anónimo a un nombre real", () => {
    expect(looksAnonymous("Antonio Ramírez")).toBe(false);
    expect(looksAnonymous("Maria L.")).toBe(false);
    expect(looksAnonymous("J")).toBe(false);
  });
});

describe("toIsoUtc", () => {
  it("normaliza datetime-local a ISO con sufijo Z", () => {
    const iso = toIsoUtc("2026-05-20T12:00");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("respeta el offset si viene incluido", () => {
    const iso = toIsoUtc("2026-05-20T12:00:00Z");
    expect(iso).toBe("2026-05-20T12:00:00.000Z");
  });
});
