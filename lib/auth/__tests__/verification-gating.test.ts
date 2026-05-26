import { describe, expect, it } from "vitest";
import {
  canPerformAction,
  claimReviewSchema,
  type VerificationAction,
} from "@/lib/auth/verification-gating";
import type { Role } from "@/lib/supabase/types";

describe("canPerformAction", () => {
  const allActions: VerificationAction[] = [
    "confirm",
    "reject",
    "reassign",
    "claim",
    "mark_removed",
    "restore",
  ];

  it("admin puede todo", () => {
    for (const a of allActions) {
      expect(canPerformAction("admin", a)).toBe(true);
    }
  });

  it("reviews_manager puede todo (paridad admin)", () => {
    for (const a of allActions) {
      expect(canPerformAction("reviews_manager", a)).toBe(true);
    }
  });

  it("office_director puede todo excepto claim (usa reassign con self)", () => {
    for (const a of allActions) {
      expect(canPerformAction("office_director", a)).toBe(a !== "claim");
    }
  });

  it("sales solo puede claim", () => {
    for (const a of allActions) {
      expect(canPerformAction("sales", a)).toBe(a === "claim");
    }
  });

  it("rol null o desconocido nunca puede actuar", () => {
    for (const a of allActions) {
      expect(canPerformAction(null, a)).toBe(false);
      expect(canPerformAction("unknown" as Role, a)).toBe(false);
    }
  });
});

describe("claimReviewSchema", () => {
  const validReviewId = "11111111-1111-1111-1111-111111111111";
  const validClientId = "22222222-2222-2222-2222-222222222222";

  it("acepta solo reviewId (reclamar sin cliente concreto)", () => {
    const r = claimReviewSchema.safeParse({ reviewId: validReviewId });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.clientId).toBeNull();
      expect(r.data.newClientName).toBeNull();
    }
  });

  it("acepta clientId existente", () => {
    const r = claimReviewSchema.safeParse({
      reviewId: validReviewId,
      clientId: validClientId,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.clientId).toBe(validClientId);
      expect(r.data.newClientName).toBeNull();
    }
  });

  it("acepta newClientName (cliente nuevo inline)", () => {
    const r = claimReviewSchema.safeParse({
      reviewId: validReviewId,
      newClientName: "Juan Pérez",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.clientId).toBeNull();
      expect(r.data.newClientName).toBe("Juan Pérez");
    }
  });

  it("normaliza newClientName: trim", () => {
    const r = claimReviewSchema.safeParse({
      reviewId: validReviewId,
      newClientName: "  Juan Pérez  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.newClientName).toBe("Juan Pérez");
    }
  });

  it("trata string vacío como null en newClientName", () => {
    const r = claimReviewSchema.safeParse({
      reviewId: validReviewId,
      newClientName: "   ",
    });
    // El refine de min(2) se aplica al string original; al ser " " con longitud 3, pasa el min,
    // pero el transform lo deja como null. El min lo evalúa Zod ANTES del transform.
    // Para "   " (3 chars), min(2) pasa → transform lo deja null. Acepta.
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.newClientName).toBeNull();
    }
  });

  it("rechaza ambos clientId y newClientName a la vez", () => {
    const r = claimReviewSchema.safeParse({
      reviewId: validReviewId,
      clientId: validClientId,
      newClientName: "Juan Pérez",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues[0]?.message ?? "";
      expect(msg).toContain("Elige un cliente existente o crea uno nuevo");
    }
  });

  it("rechaza reviewId no-uuid", () => {
    const r = claimReviewSchema.safeParse({ reviewId: "not-a-uuid" });
    expect(r.success).toBe(false);
  });

  it("rechaza newClientName < 2 chars", () => {
    const r = claimReviewSchema.safeParse({
      reviewId: validReviewId,
      newClientName: "A",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza newClientName > 120 chars", () => {
    const r = claimReviewSchema.safeParse({
      reviewId: validReviewId,
      newClientName: "x".repeat(121),
    });
    expect(r.success).toBe(false);
  });
});
