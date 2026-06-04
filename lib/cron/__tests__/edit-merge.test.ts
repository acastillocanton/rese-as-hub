import { describe, expect, it } from "vitest";
import { decideEditMerge, type IncumbentLite } from "@/lib/cron/edit-merge";

const inc = (over: Partial<IncumbentLite> = {}): IncumbentLite => ({
  id: "inc-1",
  rating: 5,
  removed_at: null,
  low_rating_alerted_at: null,
  ...over,
});

describe("decideEditMerge", () => {
  it("autor anónimo → insert (no se puede identificar a la persona)", () => {
    const r = decideEditMerge({
      hasAuthorName: false,
      incumbents: [inc()],
      incomingRating: 5,
    });
    expect(r).toEqual({ action: "insert" });
  });

  it("0 incumbentes → insert (reseña genuinamente nueva)", () => {
    const r = decideEditMerge({
      hasAuthorName: true,
      incumbents: [],
      incomingRating: 5,
    });
    expect(r).toEqual({ action: "insert" });
  });

  it("≥2 incumbentes → insert (ambigüedad legacy, no adivinar)", () => {
    const r = decideEditMerge({
      hasAuthorName: true,
      incumbents: [inc({ id: "a" }), inc({ id: "b" })],
      incomingRating: 5,
    });
    expect(r).toEqual({ action: "insert" });
  });

  it("1 incumbente 5★→5★ (Marina) → merge sin re-alert ni clearRemoved", () => {
    const r = decideEditMerge({
      hasAuthorName: true,
      incumbents: [inc({ id: "m", rating: 5 })],
      incomingRating: 5,
    });
    expect(r).toEqual({
      action: "merge",
      incumbentId: "m",
      clearRemovedAt: false,
      reAlertLowRating: false,
    });
  });

  it("1 incumbente 5★→1★ (baja a low por primera vez) → merge con re-alert", () => {
    const r = decideEditMerge({
      hasAuthorName: true,
      incumbents: [inc({ id: "x", rating: 5, low_rating_alerted_at: null })],
      incomingRating: 1,
    });
    expect(r).toEqual({
      action: "merge",
      incumbentId: "x",
      clearRemovedAt: false,
      reAlertLowRating: true,
    });
  });

  it("1 incumbente 1★→5★ (Nuria) → merge sin re-alert", () => {
    const r = decideEditMerge({
      hasAuthorName: true,
      incumbents: [inc({ id: "n", rating: 1 })],
      incomingRating: 5,
    });
    expect(r).toEqual({
      action: "merge",
      incumbentId: "n",
      clearRemovedAt: false,
      reAlertLowRating: false,
    });
  });

  it("1 incumbente 2★→1★ (ya era low) → merge sin re-alert (anti-spam)", () => {
    const r = decideEditMerge({
      hasAuthorName: true,
      incumbents: [inc({ id: "y", rating: 2 })],
      incomingRating: 1,
    });
    expect(r).toEqual({
      action: "merge",
      incumbentId: "y",
      clearRemovedAt: false,
      reAlertLowRating: false,
    });
  });

  it("1 incumbente soft-deleted → merge con clearRemovedAt=true (revive)", () => {
    const r = decideEditMerge({
      hasAuthorName: true,
      incumbents: [inc({ id: "z", removed_at: "2026-06-01T00:00:00Z" })],
      incomingRating: 5,
    });
    expect(r).toEqual({
      action: "merge",
      incumbentId: "z",
      clearRemovedAt: true,
      reAlertLowRating: false,
    });
  });

  it("1 incumbente ya alertado, edición sigue low → no re-alert", () => {
    const r = decideEditMerge({
      hasAuthorName: true,
      incumbents: [
        inc({ id: "w", rating: 5, low_rating_alerted_at: "2026-06-01T00:00:00Z" }),
      ],
      incomingRating: 1,
    });
    // rating del incumbente NO era low, pero ya había alerta previa → no repetir.
    expect(r).toEqual({
      action: "merge",
      incumbentId: "w",
      clearRemovedAt: false,
      reAlertLowRating: false,
    });
  });
});
