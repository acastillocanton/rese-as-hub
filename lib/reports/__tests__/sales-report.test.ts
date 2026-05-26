import { describe, expect, it } from "vitest";
import {
  buildSalesReportFilename,
  formatDepartmentForExcel,
  formatJoinedAtForExcel,
  formatRatingForExcel,
  formatReviewDateForExcel,
} from "@/lib/reports/sales-report";

describe("formatJoinedAtForExcel", () => {
  it("formatea ISO a DD/MM/YYYY", () => {
    expect(formatJoinedAtForExcel("2024-03-15T00:00:00Z")).toMatch(
      /^\d{2}\/\d{2}\/2024$/,
    );
  });

  it("devuelve '—' para null", () => {
    expect(formatJoinedAtForExcel(null)).toBe("—");
  });

  it("devuelve '—' para ISO inválido", () => {
    expect(formatJoinedAtForExcel("not-a-date")).toBe("—");
  });
});

describe("formatDepartmentForExcel", () => {
  it("combina departamento y ficha en formato legible", () => {
    expect(formatDepartmentForExcel("nacional", "Pardiñas")).toBe(
      "Nacional (Pardiñas)",
    );
  });

  it("solo departamento si falta la ficha", () => {
    expect(formatDepartmentForExcel("internacional", null)).toBe("Internacional");
  });

  it("solo ficha si falta el departamento", () => {
    expect(formatDepartmentForExcel(null, "Castellón")).toBe("Castellón");
  });

  it("devuelve '—' si faltan ambos", () => {
    expect(formatDepartmentForExcel(null, null)).toBe("—");
  });

  it("mapea correctamente los 4 departamentos", () => {
    expect(formatDepartmentForExcel("nacional", null)).toBe("Nacional");
    expect(formatDepartmentForExcel("internacional", null)).toBe("Internacional");
    expect(formatDepartmentForExcel("castellon", null)).toBe("Castellón");
    expect(formatDepartmentForExcel("valencia", null)).toBe("Valencia");
  });
});

describe("formatReviewDateForExcel", () => {
  it("formatea ISO a DD/MM/YYYY HH:mm", () => {
    expect(formatReviewDateForExcel("2026-05-26T14:30:00")).toMatch(
      /^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/,
    );
  });

  it("devuelve '—' para ISO inválido", () => {
    expect(formatReviewDateForExcel("nope")).toBe("—");
  });
});

describe("formatRatingForExcel", () => {
  it("5 estrellas para rating 5", () => {
    expect(formatRatingForExcel(5)).toBe("★★★★★ (5)");
  });

  it("3 estrellas + 2 vacías para rating 3", () => {
    expect(formatRatingForExcel(3)).toBe("★★★☆☆ (3)");
  });

  it("redondea ratings no enteros", () => {
    expect(formatRatingForExcel(4.6)).toBe("★★★★★ (5)");
    expect(formatRatingForExcel(4.4)).toBe("★★★★☆ (4)");
  });

  it("clampa rating fuera de 0-5", () => {
    expect(formatRatingForExcel(-1)).toBe("☆☆☆☆☆ (0)");
    expect(formatRatingForExcel(6)).toBe("★★★★★ (5)");
  });
});

describe("buildSalesReportFilename", () => {
  const range = { from: "2026-05-01", to: "2026-05-31", label: "mayo 2026" };

  it("usa slug ASCII del nombre", () => {
    expect(buildSalesReportFilename("Alejandro Castillo", range)).toBe(
      "resenas-alejandro-castillo-2026-05-01-a-2026-05-31.xlsx",
    );
  });

  it("normaliza acentos y caracteres especiales", () => {
    expect(buildSalesReportFilename("María José Ñoño", range)).toBe(
      "resenas-maria-jose-nono-2026-05-01-a-2026-05-31.xlsx",
    );
  });

  it("fallback a 'comercial' si el slug queda vacío", () => {
    expect(buildSalesReportFilename("", range)).toBe(
      "resenas-comercial-2026-05-01-a-2026-05-31.xlsx",
    );
    expect(buildSalesReportFilename("///", range)).toBe(
      "resenas-comercial-2026-05-01-a-2026-05-31.xlsx",
    );
  });

  it("colapsa múltiples espacios/símbolos en un solo guión", () => {
    expect(buildSalesReportFilename("A  B   C", range)).toBe(
      "resenas-a-b-c-2026-05-01-a-2026-05-31.xlsx",
    );
  });
});
