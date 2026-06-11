import { describe, expect, it } from "vitest";
import {
  AUTO_REMOVE_THRESHOLD_HOURS,
  decideReconcileRemoved,
  type ReconcileCandidate,
} from "@/lib/cron/reconcile-removed";

const NOW = "2026-06-11T12:00:00.000Z";

const cand = (over: Partial<ReconcileCandidate> = {}): ReconcileCandidate => ({
  id: "row-1",
  google_review_id: "gr-1",
  missing_since: null,
  ...over,
});

describe("decideReconcileRemoved", () => {
  it("presente y sin sello → no hace nada", () => {
    const r = decideReconcileRemoved({
      candidates: [cand()],
      fetchedIds: new Set(["gr-1"]),
      nowIso: NOW,
    });
    expect(r).toEqual({ reappeared: [], firstMiss: [], toRemove: [] });
  });

  it("presente pero sellada como ausente → reappeared (limpiar el sello)", () => {
    const r = decideReconcileRemoved({
      candidates: [cand({ missing_since: "2026-06-11T08:00:00.000Z" })],
      fetchedIds: new Set(["gr-1"]),
      nowIso: NOW,
    });
    expect(r.reappeared).toEqual(["row-1"]);
    expect(r.toRemove).toEqual([]);
  });

  it("primera ausencia → firstMiss, NUNCA removed directo (lección Places)", () => {
    const r = decideReconcileRemoved({
      candidates: [cand()],
      fetchedIds: new Set(),
      nowIso: NOW,
    });
    expect(r.firstMiss).toEqual(["row-1"]);
    expect(r.toRemove).toEqual([]);
  });

  it("ausente pero bajo el umbral → esperar (no tocar nada)", () => {
    // Sellada hace 23h con umbral de 24h.
    const r = decideReconcileRemoved({
      candidates: [cand({ missing_since: "2026-06-10T13:00:00.000Z" })],
      fetchedIds: new Set(),
      nowIso: NOW,
    });
    expect(r).toEqual({ reappeared: [], firstMiss: [], toRemove: [] });
  });

  it("ausencia sostenida ≥ umbral → toRemove", () => {
    // Sellada hace exactamente 24h.
    const r = decideReconcileRemoved({
      candidates: [cand({ missing_since: "2026-06-10T12:00:00.000Z" })],
      fetchedIds: new Set(),
      nowIso: NOW,
    });
    expect(r.toRemove).toEqual(["row-1"]);
  });

  it("umbral configurable", () => {
    const r = decideReconcileRemoved({
      candidates: [cand({ missing_since: "2026-06-11T05:00:00.000Z" })], // hace 7h
      fetchedIds: new Set(),
      nowIso: NOW,
      thresholdHours: 6,
    });
    expect(r.toRemove).toEqual(["row-1"]);
  });

  it("mezcla de casos en un mismo run", () => {
    const r = decideReconcileRemoved({
      candidates: [
        cand({ id: "ok", google_review_id: "gr-ok" }),
        cand({ id: "back", google_review_id: "gr-back", missing_since: "2026-06-11T09:00:00.000Z" }),
        cand({ id: "first", google_review_id: "gr-gone-1" }),
        cand({ id: "waiting", google_review_id: "gr-gone-2", missing_since: "2026-06-11T01:00:00.000Z" }),
        cand({ id: "remove", google_review_id: "gr-gone-3", missing_since: "2026-06-09T12:00:00.000Z" }),
      ],
      fetchedIds: new Set(["gr-ok", "gr-back"]),
      nowIso: NOW,
    });
    expect(r.reappeared).toEqual(["back"]);
    expect(r.firstMiss).toEqual(["first"]);
    expect(r.toRemove).toEqual(["remove"]);
  });

  it("el umbral por defecto es 24h", () => {
    expect(AUTO_REMOVE_THRESHOLD_HOURS).toBe(24);
  });
});
