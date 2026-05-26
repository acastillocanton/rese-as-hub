import { describe, expect, it } from "vitest";
import {
  computeLeaderboard,
  type LeaderboardSales,
  type LeaderboardLocation,
} from "@/lib/leaderboard";

const baseSale = (overrides: Partial<LeaderboardSales>): LeaderboardSales => ({
  id: "x",
  full_name: "Default",
  slug: "default",
  status: "active",
  monthly_goal: 30,
  location_id: "loc1",
  role: "sales",
  ...overrides,
});

const LOC: LeaderboardLocation[] = [
  { id: "loc1", name: "Inseryal · Oropesa" },
  { id: "loc2", name: "Marina d'Or Construcciones · Castellón" },
];

describe("computeLeaderboard", () => {
  it("returns empty array when no sales", () => {
    const rows = computeLeaderboard({ sales: [], locations: LOC, shares: [], reviews: [] });
    expect(rows).toEqual([]);
  });

  it("sorts by reviews DESC, then name ASC (visits ya no desempata)", () => {
    const sales: LeaderboardSales[] = [
      baseSale({ id: "a", full_name: "Ana", slug: "ana" }),
      baseSale({ id: "b", full_name: "Bea", slug: "bea" }),
      baseSale({ id: "c", full_name: "Cris", slug: "cris" }),
      baseSale({ id: "d", full_name: "Dani", slug: "dani" }),
    ];
    const rows = computeLeaderboard({
      sales,
      locations: LOC,
      shares: [
        { sales_id: "a" },
        { sales_id: "a" },
        { sales_id: "b" }, // bea: 1 visita, 1 reseña
        { sales_id: "d" }, // dani: 2 visitas, 1 reseña → empate con bea por reseñas
        { sales_id: "d" },
      ],
      reviews: [
        { sales_id: "a", match_state: "counted" }, // ana: 1 reseña
        { sales_id: "a", match_state: "counted" }, // ana: 2 reseñas total
        { sales_id: "b", match_state: "counted" }, // bea: 1
        { sales_id: "d", match_state: "counted" }, // dani: 1
        // cris: 0 reseñas → último
      ],
    });

    // ana primero (2 reseñas). bea y dani empatan a 1 reseña → desempata
    // alfabéticamente, "Bea" < "Dani". cris último (0 reseñas).
    // Decisión de producto 2026-05-26: visits ya no desempata
    // (ver lib/leaderboard.ts).
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("calculates conversion as round(reviews/visits * 100)", () => {
    const sales = [baseSale({ id: "x", full_name: "X", slug: "x" })];
    const rows = computeLeaderboard({
      sales,
      locations: LOC,
      shares: [
        { sales_id: "x" },
        { sales_id: "x" },
        { sales_id: "x" },
      ],
      reviews: [{ sales_id: "x", match_state: "counted" }],
    });
    const x = rows[0]!;
    expect(x.visits).toBe(3);
    expect(x.reviews).toBe(1);
    // 1/3 = 33.33% → round → 33
    expect(x.conv).toBe(33);
  });

  it("conversion is 0 when no visits", () => {
    const sales = [baseSale({ id: "x", full_name: "X", slug: "x" })];
    const rows = computeLeaderboard({
      sales,
      locations: LOC,
      shares: [],
      reviews: [],
    });
    expect(rows[0]!.conv).toBe(0);
    expect(rows[0]!.visits).toBe(0);
    expect(rows[0]!.reviews).toBe(0);
  });

  it("counts 'counted' separately from total reviews", () => {
    const sales = [baseSale({ id: "x", full_name: "X", slug: "x" })];
    const rows = computeLeaderboard({
      sales,
      locations: LOC,
      shares: [],
      reviews: [
        { sales_id: "x", match_state: "counted" },
        { sales_id: "x", match_state: "pending" },
        { sales_id: "x", match_state: "counted" },
      ],
    });
    expect(rows[0]!.reviews).toBe(3); // total
    expect(rows[0]!.counted).toBe(2); // solo counted
  });

  it("ignores reviews with sales_id=null", () => {
    const sales = [baseSale({ id: "x", full_name: "X", slug: "x" })];
    const rows = computeLeaderboard({
      sales,
      locations: LOC,
      shares: [],
      reviews: [
        { sales_id: "x", match_state: "counted" },
        { sales_id: null, match_state: "unmatched" },
        { sales_id: null, match_state: "unmatched" },
      ],
    });
    expect(rows[0]!.reviews).toBe(1);
  });

  it("attaches the branch name from locations[].name", () => {
    const sales = [
      baseSale({ id: "a", full_name: "A", slug: "a", location_id: "loc1" }),
      baseSale({ id: "b", full_name: "B", slug: "b", location_id: "loc2" }),
      baseSale({ id: "c", full_name: "C", slug: "c", location_id: null }),
    ];
    const rows = computeLeaderboard({ sales, locations: LOC, shares: [], reviews: [] });
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    expect(byId.get("a")!.branch).toBe("Inseryal · Oropesa");
    expect(byId.get("b")!.branch).toBe("Marina d'Or Construcciones · Castellón");
    expect(byId.get("c")!.branch).toBe("—");
  });

  it("marks office_director with isDirector=true", () => {
    const sales = [
      baseSale({ id: "s", full_name: "Sales", slug: "sales", role: "sales" }),
      baseSale({ id: "d", full_name: "Direct", slug: "direct", role: "office_director" }),
    ];
    const rows = computeLeaderboard({ sales, locations: LOC, shares: [], reviews: [] });
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    expect(byId.get("s")!.isDirector).toBe(false);
    expect(byId.get("d")!.isDirector).toBe(true);
  });

  it("ties on 0/0 are broken alphabetically (deterministic)", () => {
    const sales: LeaderboardSales[] = [
      baseSale({ id: "z", full_name: "Zoe", slug: "zoe" }),
      baseSale({ id: "a", full_name: "Ana", slug: "ana" }),
      baseSale({ id: "m", full_name: "Mar", slug: "mar" }),
    ];
    const rows = computeLeaderboard({ sales, locations: LOC, shares: [], reviews: [] });
    expect(rows.map((r) => r.id)).toEqual(["a", "m", "z"]);
  });

  it("marks isSelf=true only on the row whose id matches currentUserId", () => {
    const sales: LeaderboardSales[] = [
      baseSale({ id: "a", full_name: "Ana", slug: "ana" }),
      baseSale({ id: "b", full_name: "Bea", slug: "bea" }),
      baseSale({ id: "c", full_name: "Cris", slug: "cris" }),
    ];
    const rows = computeLeaderboard({
      sales,
      locations: LOC,
      shares: [],
      reviews: [],
      currentUserId: "b",
    });
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    expect(byId.get("a")!.isSelf).toBe(false);
    expect(byId.get("b")!.isSelf).toBe(true);
    expect(byId.get("c")!.isSelf).toBe(false);
  });

  it("marks isSelf=false on every row when currentUserId is undefined", () => {
    const sales = [
      baseSale({ id: "a", full_name: "Ana", slug: "ana" }),
      baseSale({ id: "b", full_name: "Bea", slug: "bea" }),
    ];
    const rows = computeLeaderboard({ sales, locations: LOC, shares: [], reviews: [] });
    expect(rows.every((r) => r.isSelf === false)).toBe(true);
  });
});
