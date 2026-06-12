import { describe, expect, it } from "vitest";
import {
  checkFailedNotifications,
  checkHarvestStalled,
  checkLocationsSyncStale,
  checkVerificationBacklog,
  sortFindings,
  HARVEST_NO_RUN_HOURS,
  LOCATION_SYNC_STALE_HOURS,
  VERIFICATION_BACKLOG_THRESHOLD,
  type HealthFinding,
  type LocationSyncLite,
} from "@/lib/monitoring/health-checks";

const NOW = new Date("2026-06-12T08:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

// ---------------------------------------------------------------------------
// checkHarvestStalled
// ---------------------------------------------------------------------------

describe("checkHarvestStalled", () => {
  it("sin pendientes → null (no hay fallo posible aunque no haya latido)", () => {
    expect(checkHarvestStalled({ lastRun: null, pendingCount: 0, nowMs: NOW })).toBeNull();
    expect(
      checkHarvestStalled({
        lastRun: { createdAt: hoursAgo(200), harvested: 0 },
        pendingCount: 0,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it("sin latido + pendientes → warning (¿PC encendido / actualizado?)", () => {
    const f = checkHarvestStalled({ lastRun: null, pendingCount: 12, nowMs: NOW });
    expect(f?.id).toBe("harvest_no_heartbeat");
    expect(f?.severity).toBe("warning");
  });

  it("pasada reciente que cosechó reseñas → null (sano)", () => {
    const f = checkHarvestStalled({
      lastRun: { createdAt: hoursAgo(2), harvested: 40 },
      pendingCount: 15,
      nowMs: NOW,
    });
    expect(f).toBeNull();
  });

  it("pasada reciente con harvested=0 y pendientes → critical (DOM roto)", () => {
    const f = checkHarvestStalled({
      lastRun: { createdAt: hoursAgo(3), harvested: 0 },
      pendingCount: 15,
      nowMs: NOW,
    });
    expect(f?.id).toBe("harvest_dom_broken");
    expect(f?.severity).toBe("critical");
  });

  it("última pasada hace más de 72h → warning (no corre)", () => {
    const f = checkHarvestStalled({
      lastRun: { createdAt: hoursAgo(HARVEST_NO_RUN_HOURS + 5), harvested: 30 },
      pendingCount: 15,
      nowMs: NOW,
    });
    expect(f?.id).toBe("harvest_no_run");
    expect(f?.severity).toBe("warning");
  });

  it("vieja Y con harvested=0 → prima 'no corre' (no asume DOM roto sobre dato antiguo)", () => {
    const f = checkHarvestStalled({
      lastRun: { createdAt: hoursAgo(HARVEST_NO_RUN_HOURS + 5), harvested: 0 },
      pendingCount: 15,
      nowMs: NOW,
    });
    expect(f?.id).toBe("harvest_no_run");
  });
});

// ---------------------------------------------------------------------------
// checkLocationsSyncStale
// ---------------------------------------------------------------------------

function loc(over: Partial<LocationSyncLite>): LocationSyncLite {
  return {
    id: over.id ?? "loc-1",
    name: over.name ?? "Oropesa",
    oauthStatus: over.oauthStatus ?? "connected",
    // "lastSyncAt" in over distingue "no pasado" (→ reciente) de null explícito.
    lastSyncAt: "lastSyncAt" in over ? over.lastSyncAt! : hoursAgo(1),
    lastSyncError: over.lastSyncError ?? null,
  };
}

describe("checkLocationsSyncStale", () => {
  it("ignora fichas no conectadas (aunque tengan error)", () => {
    const out = checkLocationsSyncStale({
      locations: [loc({ oauthStatus: "disconnected", lastSyncError: "boom" })],
      nowMs: NOW,
    });
    expect(out).toHaveLength(0);
  });

  it("ficha conectada en error → critical", () => {
    const out = checkLocationsSyncStale({
      locations: [loc({ lastSyncError: "429 RESOURCE_EXHAUSTED" })],
      nowMs: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("critical");
    expect(out[0]?.id).toBe("location_sync_error:loc-1");
  });

  it("ficha conectada que nunca sincronizó → warning", () => {
    const out = checkLocationsSyncStale({
      locations: [loc({ lastSyncAt: null })],
      nowMs: NOW,
    });
    expect(out[0]?.id).toBe("location_sync_stale:loc-1");
    expect(out[0]?.severity).toBe("warning");
  });

  it("ficha sin sincronizar hace más de 36h → warning", () => {
    const out = checkLocationsSyncStale({
      locations: [loc({ lastSyncAt: hoursAgo(LOCATION_SYNC_STALE_HOURS + 2) })],
      nowMs: NOW,
    });
    expect(out[0]?.id).toBe("location_sync_stale:loc-1");
  });

  it("ficha sincronizada hace poco → sin finding", () => {
    const out = checkLocationsSyncStale({
      locations: [loc({ lastSyncAt: hoursAgo(2) })],
      nowMs: NOW,
    });
    expect(out).toHaveLength(0);
  });

  it("varias fichas → un finding por cada una con problema", () => {
    const out = checkLocationsSyncStale({
      locations: [
        loc({ id: "a", name: "A", lastSyncError: "boom" }),
        loc({ id: "b", name: "B", lastSyncAt: hoursAgo(2) }), // sana
        loc({ id: "c", name: "C", lastSyncAt: null }),
      ],
      nowMs: NOW,
    });
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.id).sort()).toEqual([
      "location_sync_error:a",
      "location_sync_stale:c",
    ]);
  });
});

// ---------------------------------------------------------------------------
// checkVerificationBacklog
// ---------------------------------------------------------------------------

describe("checkVerificationBacklog", () => {
  it("bajo el umbral → null", () => {
    expect(
      checkVerificationBacklog({ recentUnmatchedCount: VERIFICATION_BACKLOG_THRESHOLD }),
    ).toBeNull();
    expect(checkVerificationBacklog({ recentUnmatchedCount: 0 })).toBeNull();
  });

  it("sobre el umbral → warning", () => {
    const f = checkVerificationBacklog({
      recentUnmatchedCount: VERIFICATION_BACKLOG_THRESHOLD + 1,
    });
    expect(f?.id).toBe("verification_backlog");
    expect(f?.severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// checkFailedNotifications
// ---------------------------------------------------------------------------

describe("checkFailedNotifications", () => {
  it("0 fallidos → null", () => {
    expect(checkFailedNotifications({ failedCount: 0 })).toBeNull();
  });
  it(">0 fallidos → warning", () => {
    const f = checkFailedNotifications({ failedCount: 3 });
    expect(f?.id).toBe("notify_failed");
    expect(f?.severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// sortFindings
// ---------------------------------------------------------------------------

describe("sortFindings", () => {
  it("critical primero, luego por id estable", () => {
    const findings: HealthFinding[] = [
      { id: "z_warn", severity: "warning", title: "", detail: "" },
      { id: "b_crit", severity: "critical", title: "", detail: "" },
      { id: "a_warn", severity: "warning", title: "", detail: "" },
      { id: "a_crit", severity: "critical", title: "", detail: "" },
    ];
    expect(sortFindings(findings).map((f) => f.id)).toEqual([
      "a_crit",
      "b_crit",
      "a_warn",
      "z_warn",
    ]);
  });

  it("no muta el array original", () => {
    const findings: HealthFinding[] = [
      { id: "b", severity: "warning", title: "", detail: "" },
      { id: "a", severity: "critical", title: "", detail: "" },
    ];
    sortFindings(findings);
    expect(findings[0]?.id).toBe("b");
  });
});
