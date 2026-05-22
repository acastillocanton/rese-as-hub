import { describe, it, expect } from "vitest";
import {
  parseRange,
  thisMonthRange,
  lastMonthRange,
  lastQuarterRange,
  isFullNaturalMonth,
} from "../date-range";

// Fecha de referencia fija para reproducibilidad: 15 mayo 2026 (mié).
const NOW = new Date(2026, 4, 15); // mes index 4 = mayo

describe("thisMonthRange", () => {
  it("rango = 1..último día del mes actual", () => {
    const r = thisMonthRange(NOW);
    expect(r.from).toBe("2026-05-01");
    expect(r.to).toBe("2026-05-31");
    expect(r.label).toBe("mayo 2026");
  });
});

describe("lastMonthRange", () => {
  it("rango = mes anterior completo", () => {
    const r = lastMonthRange(NOW);
    expect(r.from).toBe("2026-04-01");
    expect(r.to).toBe("2026-04-30");
    expect(r.label).toBe("abril 2026");
  });

  it("salto de año diciembre → enero", () => {
    const enero = new Date(2026, 0, 10); // 10 ene 2026
    const r = lastMonthRange(enero);
    expect(r.from).toBe("2025-12-01");
    expect(r.to).toBe("2025-12-31");
  });
});

describe("lastQuarterRange", () => {
  it("desde 3 meses atrás hasta cierre del mes anterior", () => {
    const r = lastQuarterRange(NOW);
    expect(r.from).toBe("2026-02-01");
    expect(r.to).toBe("2026-04-30");
  });
});

describe("parseRange", () => {
  it("from/to válidos → buildRange con esos valores", () => {
    const r = parseRange("2026-03-01", "2026-03-31", NOW);
    expect(r.from).toBe("2026-03-01");
    expect(r.to).toBe("2026-03-31");
    expect(r.label).toBe("marzo 2026");
  });

  it("from o to vacío → cae a mes actual", () => {
    expect(parseRange(undefined, "2026-03-31", NOW).from).toBe("2026-05-01");
    expect(parseRange("2026-03-01", undefined, NOW).from).toBe("2026-05-01");
    expect(parseRange(null, null, NOW).from).toBe("2026-05-01");
  });

  it("formato inválido → cae a mes actual", () => {
    expect(parseRange("invalid", "2026-03-31", NOW).from).toBe("2026-05-01");
    expect(parseRange("2026-13-01", "2026-03-31", NOW).from).toBe("2026-05-01");
    expect(parseRange("2026-02-30", "2026-03-31", NOW).from).toBe("2026-05-01");
  });

  it("from > to (invertido) → cae a mes actual (no invierte silenciosamente)", () => {
    const r = parseRange("2026-05-31", "2026-05-01", NOW);
    // Antes invertía silencioso; ahora caemos al mes actual.
    expect(r.from).toBe("2026-05-01");
    expect(r.to).toBe("2026-05-31");
  });

  it("rango con un solo día válido", () => {
    const r = parseRange("2026-03-15", "2026-03-15", NOW);
    expect(r.from).toBe("2026-03-15");
    expect(r.to).toBe("2026-03-15");
  });

  it("rango cross-month produce label compacto", () => {
    const r = parseRange("2026-03-15", "2026-04-15", NOW);
    expect(r.label).toContain("mar");
    expect(r.label).toContain("abr");
    expect(r.label).toContain("–");
  });
});

describe("isFullNaturalMonth", () => {
  it("rango 1..ult-día → true", () => {
    expect(isFullNaturalMonth(thisMonthRange(NOW))).toBe(true);
    expect(isFullNaturalMonth(lastMonthRange(NOW))).toBe(true);
  });

  it("rango con día central → false", () => {
    expect(isFullNaturalMonth(parseRange("2026-05-02", "2026-05-31", NOW))).toBe(
      false,
    );
    expect(isFullNaturalMonth(parseRange("2026-05-01", "2026-05-30", NOW))).toBe(
      false,
    );
  });

  it("rango cross-month → false", () => {
    expect(isFullNaturalMonth(parseRange("2026-05-01", "2026-06-30", NOW))).toBe(
      false,
    );
  });

  it("rango trimestral (3 meses) → false", () => {
    expect(isFullNaturalMonth(lastQuarterRange(NOW))).toBe(false);
  });
});
