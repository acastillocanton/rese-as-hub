import { describe, it, expect } from "vitest";
import {
  canReplyToReviews,
  replyTextSchema,
  saveReplySchema,
  isReplied,
} from "../reply-gating";

describe("canReplyToReviews", () => {
  it("permite a admin y reviews_manager", () => {
    expect(canReplyToReviews("admin")).toBe(true);
    expect(canReplyToReviews("reviews_manager")).toBe(true);
  });
  it("deniega a sales, office_director y sin rol", () => {
    expect(canReplyToReviews("sales")).toBe(false);
    expect(canReplyToReviews("office_director")).toBe(false);
    expect(canReplyToReviews(null)).toBe(false);
    expect(canReplyToReviews(undefined)).toBe(false);
  });
});

describe("replyTextSchema", () => {
  it("rechaza vacío y solo-espacios", () => {
    expect(replyTextSchema.safeParse("").success).toBe(false);
    expect(replyTextSchema.safeParse("   ").success).toBe(false);
  });
  it("acepta texto normal (con trim)", () => {
    const r = replyTextSchema.safeParse("  ¡Gracias por tu reseña!  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("¡Gracias por tu reseña!");
  });
  it("conserva los emojis intactos", () => {
    const r = replyTextSchema.safeParse("Gracias 🙏😊");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("Gracias 🙏😊");
  });
  it("acepta 4096 caracteres y rechaza 4097", () => {
    expect(replyTextSchema.safeParse("a".repeat(4096)).success).toBe(true);
    expect(replyTextSchema.safeParse("a".repeat(4097)).success).toBe(false);
  });
});

describe("saveReplySchema", () => {
  it("exige reviewId uuid + texto válido", () => {
    expect(
      saveReplySchema.safeParse({ reviewId: "not-a-uuid", text: "hola" }).success,
    ).toBe(false);
    expect(
      saveReplySchema.safeParse({
        reviewId: "11111111-1111-1111-1111-111111111111",
        text: "hola",
      }).success,
    ).toBe(true);
  });
});

describe("isReplied", () => {
  it("NULL → false, fecha → true", () => {
    expect(isReplied({ replied_at: null })).toBe(false);
    expect(isReplied({ replied_at: "2026-06-09T10:00:00Z" })).toBe(true);
  });
});
