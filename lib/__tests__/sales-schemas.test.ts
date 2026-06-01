import { describe, expect, it } from "vitest";
import { commissionRateSchema } from "@/lib/validation/sales-schemas";

describe("commissionRateSchema", () => {
  it("vacío / null / undefined → null (sin tarifa)", () => {
    expect(commissionRateSchema.parse("")).toBeNull();
    expect(commissionRateSchema.parse("   ")).toBeNull();
    expect(commissionRateSchema.parse(null)).toBeNull();
    expect(commissionRateSchema.parse(undefined)).toBeNull();
  });

  it("acepta números (string o number) y redondea a 2 decimales", () => {
    expect(commissionRateSchema.parse("20")).toBe(20);
    expect(commissionRateSchema.parse(2.5)).toBe(2.5);
    expect(commissionRateSchema.parse("2.567")).toBe(2.57);
  });

  it("admite coma decimal", () => {
    expect(commissionRateSchema.parse("2,50")).toBe(2.5);
  });

  it("acota a un máximo de 9999", () => {
    expect(commissionRateSchema.parse("100000")).toBe(9999);
  });

  it("RECHAZA entradas no vacías inválidas en vez de coaccionar a null", () => {
    expect(commissionRateSchema.safeParse("abc").success).toBe(false);
    expect(commissionRateSchema.safeParse("-5").success).toBe(false);
    expect(commissionRateSchema.safeParse(-1).success).toBe(false);
  });
});
