import { describe, expect, it } from "vitest";
import { jorgeReportMonths } from "@/lib/reports/jorge-report";
import { parseRange, commissionPeriodRange } from "@/lib/date-range";

describe("jorgeReportMonths", () => {
  it("periodo de comisión: se nombra por su mes de CIERRE (día 19)", () => {
    // Periodo de facturación 20-feb → 19-mar = 'MARZO' (cierra en marzo).
    // Anterior 20-ene → 19-feb = 'FEBRERO'. Como el parte manual titulado MARZO.
    const range = parseRange("2026-02-20", "2026-03-19");
    const { current, previous } = jorgeReportMonths(range);
    expect(current).toEqual({ year: 2026, monthIndex: 2 }); // marzo
    expect(previous).toEqual({ year: 2026, monthIndex: 1 }); // febrero
  });

  it("la ventana del mes actual es el periodo de facturación 20→19, no un mes natural", () => {
    const range = parseRange("2026-02-20", "2026-03-19");
    const { currentWindow } = jorgeReportMonths(range);
    // Arranca el 20-feb (no el 1-mar).
    expect(new Date(currentWindow.startIso).getDate()).toBe(20);
    expect(new Date(currentWindow.startIso).getMonth()).toBe(1); // febrero
    // Fin exclusivo = 20-mar (día siguiente al 19-mar inclusive).
    expect(new Date(currentWindow.endIso).getDate()).toBe(20);
    expect(new Date(currentWindow.endIso).getMonth()).toBe(2); // marzo
  });

  it("generado el 31-jul (periodo vigente 20-jul→19-ago): actual=AGOSTO, anterior=JULIO", () => {
    // El default de la card es el periodo de comisión vigente.
    const range = commissionPeriodRange(new Date(2026, 6, 31)); // 31 jul
    const { current, previous, currentWindow } = jorgeReportMonths(range);
    expect(current).toEqual({ year: 2026, monthIndex: 7 }); // agosto
    expect(previous).toEqual({ year: 2026, monthIndex: 6 }); // julio
    // El periodo de agosto ya incluye el 20-jul en adelante → tiene datos.
    expect(new Date(currentWindow.startIso).getMonth()).toBe(6); // arranca en julio
    expect(new Date(currentWindow.startIso).getDate()).toBe(20);
  });

  it("cruza el año: periodo que cierra en enero", () => {
    // 20-dic-2025 → 19-ene-2026 = 'ENERO 2026'.
    const range = parseRange("2025-12-20", "2026-01-19");
    const { current, previous } = jorgeReportMonths(range);
    expect(current).toEqual({ year: 2026, monthIndex: 0 }); // enero
    expect(previous).toEqual({ year: 2025, monthIndex: 11 }); // diciembre
  });

  it("las dos ventanas son contiguas y no se solapan", () => {
    const range = parseRange("2026-02-20", "2026-03-19");
    const { currentWindow, previousWindow } = jorgeReportMonths(range);
    // El fin del periodo anterior coincide con el inicio del actual.
    expect(previousWindow.endIso).toBe(currentWindow.startIso);
  });
});
