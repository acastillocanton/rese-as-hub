import { describe, it, expect } from "vitest";
import { getMotivationSuffix } from "../panel-motivation";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const DATA = { daysLeft: 10 };

describe("getMotivationSuffix — estado 'behind'", () => {
  it("devuelve una cadena no vacía para cada día de la semana", () => {
    for (const day of DAYS) {
      const msg = getMotivationSuffix(day, "behind", DATA);
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("los 7 mensajes son distintos entre sí", () => {
    const msgs = DAYS.map((d) => getMotivationSuffix(d, "behind", DATA));
    expect(new Set(msgs).size).toBe(7);
  });
});

describe("getMotivationSuffix — estado 'on_track'", () => {
  it("devuelve una cadena no vacía para cada día de la semana", () => {
    for (const day of DAYS) {
      const msg = getMotivationSuffix(day, "on_track", DATA);
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("los 7 mensajes son distintos entre sí", () => {
    const msgs = DAYS.map((d) => getMotivationSuffix(d, "on_track", DATA));
    expect(new Set(msgs).size).toBe(7);
  });
});

describe("getMotivationSuffix — estado 'done'", () => {
  it("devuelve una cadena no vacía para cada día de la semana", () => {
    for (const day of DAYS) {
      const msg = getMotivationSuffix(day, "done", DATA);
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("los 7 mensajes son distintos entre sí", () => {
    const msgs = DAYS.map((d) => getMotivationSuffix(d, "done", DATA));
    expect(new Set(msgs).size).toBe(7);
  });

  it("interpola daysLeft cuando el mensaje lo incluye", () => {
    // Dom (0) y Mié (3) incluyen daysLeft
    const msgDom = getMotivationSuffix(0, "done", { daysLeft: 15 });
    expect(msgDom).toContain("15");

    const msgMie = getMotivationSuffix(2, "done", { daysLeft: 7 });
    expect(msgMie).toContain("7");
  });
});

describe("getMotivationSuffix — robustez", () => {
  it("normaliza dayOfWeek negativo a un rango válido", () => {
    const msg = getMotivationSuffix(-1, "behind", DATA);
    expect(msg.length).toBeGreaterThan(0);
  });

  it("normaliza dayOfWeek > 6 a un rango válido", () => {
    const msg = getMotivationSuffix(7, "behind", DATA);
    expect(msg.length).toBeGreaterThan(0);
  });
});
