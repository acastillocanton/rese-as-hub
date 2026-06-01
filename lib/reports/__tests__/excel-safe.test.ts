import { describe, expect, it } from "vitest";
import { excelSafe } from "@/lib/reports/excel-safe";

describe("excelSafe", () => {
  it("prefija con comilla los disparadores de fórmula", () => {
    expect(excelSafe("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(excelSafe("+1")).toBe("'+1");
    expect(excelSafe("-1+2")).toBe("'-1+2");
    expect(excelSafe("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(excelSafe("\tcmd")).toBe("'\tcmd");
    expect(excelSafe("\rfoo")).toBe("'\rfoo");
  });

  it("deja intactos los valores normales", () => {
    expect(excelSafe("María José")).toBe("María José");
    expect(excelSafe("Familia Soriano")).toBe("Familia Soriano");
    expect(excelSafe("4 estrellas, todo bien")).toBe("4 estrellas, todo bien");
  });

  it("trata null/undefined/vacío como cadena vacía", () => {
    expect(excelSafe(null)).toBe("");
    expect(excelSafe(undefined)).toBe("");
    expect(excelSafe("")).toBe("");
  });

  it("no escapa un guion en medio (solo al inicio)", () => {
    expect(excelSafe("Jean-Pierre")).toBe("Jean-Pierre");
  });
});
