import { describe, expect, it } from "vitest";
import {
  commissionEuro,
  isCapped,
  payableCount,
  pendingCommissionEuro,
} from "@/lib/commission";

describe("payableCount", () => {
  it("sin tope (cap null) paga todas las counted", () => {
    expect(payableCount(8, null)).toBe(8);
    expect(payableCount(0, null)).toBe(0);
  });

  it("por debajo del tope paga todas", () => {
    expect(payableCount(3, 5)).toBe(3);
  });

  it("justo en el tope paga el tope", () => {
    expect(payableCount(5, 5)).toBe(5);
  });

  it("por encima del tope topa en cap", () => {
    expect(payableCount(8, 5)).toBe(5);
  });

  it("tope 0 no paga ninguna", () => {
    expect(payableCount(8, 0)).toBe(0);
  });

  it("tope negativo se trata como 0 (defensivo)", () => {
    expect(payableCount(8, -3)).toBe(0);
  });
});

describe("commissionEuro", () => {
  it("null si no hay tarifa", () => {
    expect(commissionEuro(8, null, 5)).toBeNull();
  });

  it("rate × counted cuando no hay tope", () => {
    expect(commissionEuro(8, 10, null)).toBe(80);
  });

  it("rate × tope cuando se supera", () => {
    expect(commissionEuro(8, 10, 5)).toBe(50);
  });

  it("rate × counted cuando está bajo el tope", () => {
    expect(commissionEuro(3, 10, 5)).toBe(30);
  });
});

describe("pendingCommissionEuro", () => {
  it("null si no hay tarifa", () => {
    expect(pendingCommissionEuro(3, 2, null, 5)).toBeNull();
  });

  it("sin tope suma todas las pending", () => {
    expect(pendingCommissionEuro(3, 2, 10, null)).toBe(20);
  });

  it("cuenta solo lo que cabe bajo el tope", () => {
    // counted=3, pending=4, cap=5 → solo 2 caben → 2×10
    expect(pendingCommissionEuro(3, 4, 10, 5)).toBe(20);
  });

  it("ya en el tope: pending no añade nada", () => {
    expect(pendingCommissionEuro(5, 3, 10, 5)).toBe(0);
  });

  it("ya por encima del tope: pending no añade nada", () => {
    expect(pendingCommissionEuro(8, 3, 10, 5)).toBe(0);
  });
});

describe("isCapped", () => {
  it("false sin tope", () => {
    expect(isCapped(100, null)).toBe(false);
  });

  it("false en o por debajo del tope", () => {
    expect(isCapped(5, 5)).toBe(false);
    expect(isCapped(3, 5)).toBe(false);
  });

  it("true por encima del tope", () => {
    expect(isCapped(8, 5)).toBe(true);
  });
});
