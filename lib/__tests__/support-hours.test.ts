import { describe, expect, it } from "vitest";
import {
  getSupportHoursNotice,
  isIntensiveMonth,
  madridMonth,
} from "@/lib/support-hours";

describe("isIntensiveMonth", () => {
  it("solo julio y agosto son intensivos", () => {
    expect(isIntensiveMonth(7)).toBe(true);
    expect(isIntensiveMonth(8)).toBe(true);
    for (const m of [1, 2, 3, 4, 5, 6, 9, 10, 11, 12]) {
      expect(isIntensiveMonth(m)).toBe(false);
    }
  });
});

describe("madridMonth", () => {
  it("devuelve el mes en hora de Madrid, no UTC", () => {
    // 30 jun 22:30 UTC = 1 jul 00:30 en Madrid (CEST, +2)
    expect(madridMonth(new Date("2026-06-30T22:30:00Z"))).toBe(7);
    // 31 ago 22:30 UTC = 1 sep 00:30 en Madrid
    expect(madridMonth(new Date("2026-08-31T22:30:00Z"))).toBe(9);
    // Pleno invierno (CET, +1): 31 dic 23:30 UTC = 1 ene 00:30 en Madrid
    expect(madridMonth(new Date("2026-12-31T23:30:00Z"))).toBe(1);
  });

  it("mes normal sin cruce de día", () => {
    expect(madridMonth(new Date("2026-06-11T10:00:00Z"))).toBe(6);
  });
});

describe("getSupportHoursNotice", () => {
  it("septiembre-junio: jornada partida 9-14 y 15-18", () => {
    expect(getSupportHoursNotice(new Date("2026-06-11T10:00:00Z"))).toBe(
      "Horario de atención: lunes a viernes de 9:00 a 14:00 y de 15:00 a 18:00.",
    );
    expect(getSupportHoursNotice(new Date("2026-09-15T10:00:00Z"))).toContain(
      "9:00 a 14:00",
    );
  });

  it("julio y agosto: intensivo 8-15", () => {
    expect(getSupportHoursNotice(new Date("2026-07-15T10:00:00Z"))).toBe(
      "Horario de atención (intensivo de verano): lunes a viernes de 8:00 a 15:00.",
    );
    expect(getSupportHoursNotice(new Date("2026-08-03T10:00:00Z"))).toContain(
      "8:00 a 15:00",
    );
  });

  it("el cambio de horario respeta la zona de Madrid", () => {
    // Aún 30 jun en UTC pero ya 1 jul en Madrid → intensivo
    expect(getSupportHoursNotice(new Date("2026-06-30T22:30:00Z"))).toContain(
      "intensivo",
    );
  });
});
