import { describe, expect, it } from "vitest";
import {
  computePanelBadges,
  trailingStreak,
  type PanelBadgesInput,
} from "@/lib/panel-badges";

const base: PanelBadgesInput = {
  lifetimeCounted: 0,
  reviewsThisPeriod: 0,
  goal: 5,
  monthBuckets: [0, 0, 0, 0, 0, 0],
  fiveStarCount: 0,
  rankIndex: null,
  teamSize: 1,
};

function byId(badges: ReturnType<typeof computePanelBadges>, id: string) {
  return badges.find((b) => b.id === id);
}

describe("trailingStreak", () => {
  it("returns 0 when goal is 0 or negative", () => {
    expect(trailingStreak([10, 10, 10], 0)).toBe(0);
    expect(trailingStreak([10, 10, 10], -3)).toBe(0);
  });

  it("counts completed months meeting the goal, ignoring an in-progress current month", () => {
    // últimos buckets: [.., abr=6, may=7, jun(actual)=1] con goal 5
    // jun aún no llega → se ignora; abr y may sí → racha 2
    expect(trailingStreak([0, 0, 0, 6, 7, 1], 5)).toBe(2);
  });

  it("includes the current month when it already reached the goal", () => {
    expect(trailingStreak([0, 0, 0, 6, 7, 8], 5)).toBe(3);
  });

  it("breaks the streak on the first month below goal", () => {
    expect(trailingStreak([6, 2, 6, 6], 5)).toBe(2);
  });

  it("returns 0 for empty buckets", () => {
    expect(trailingStreak([], 5)).toBe(0);
  });
});

describe("computePanelBadges", () => {
  it("always includes objetivo and racha badges", () => {
    const badges = computePanelBadges(base);
    expect(byId(badges, "monthly_goal")).toBeDefined();
    expect(byId(badges, "streak")).toBeDefined();
  });

  it("marks the monthly goal as earned when reached", () => {
    const badges = computePanelBadges({ ...base, reviewsThisPeriod: 5, goal: 5 });
    expect(byId(badges, "monthly_goal")?.earned).toBe(true);
  });

  it("does not earn the monthly goal when goal is 0", () => {
    const badges = computePanelBadges({ ...base, reviewsThisPeriod: 3, goal: 0 });
    expect(byId(badges, "monthly_goal")?.earned).toBe(false);
  });

  it("omits team badges when there is no team", () => {
    const badges = computePanelBadges({ ...base, teamSize: 1, rankIndex: 0 });
    expect(byId(badges, "podium")).toBeUndefined();
    expect(byId(badges, "leader")).toBeUndefined();
  });

  it("includes team badges when there is a team", () => {
    const badges = computePanelBadges({ ...base, teamSize: 4, rankIndex: 2 });
    expect(byId(badges, "podium")?.earned).toBe(true); // puesto 3 → top 3
    expect(byId(badges, "leader")?.earned).toBe(false);
  });

  it("earns leader and podium for the #1", () => {
    const badges = computePanelBadges({ ...base, teamSize: 4, rankIndex: 0 });
    expect(byId(badges, "leader")?.earned).toBe(true);
    expect(byId(badges, "podium")?.earned).toBe(true);
  });

  it("does not earn podium below top 3", () => {
    const badges = computePanelBadges({ ...base, teamSize: 6, rankIndex: 3 });
    expect(byId(badges, "podium")?.earned).toBe(false);
  });

  it("shows earned volume tiers plus the next locked one", () => {
    const badges = computePanelBadges({ ...base, lifetimeCounted: 30 });
    expect(byId(badges, "volume_10")?.earned).toBe(true);
    expect(byId(badges, "volume_25")?.earned).toBe(true);
    expect(byId(badges, "volume_50")?.earned).toBe(false); // siguiente
    expect(byId(badges, "volume_100")).toBeUndefined(); // no se muestra aún
  });

  it("shows only the lowest volume tier (locked) when starting out", () => {
    const badges = computePanelBadges({ ...base, lifetimeCounted: 0 });
    expect(byId(badges, "volume_10")?.earned).toBe(false);
    expect(byId(badges, "volume_25")).toBeUndefined();
  });

  it("earns the top volume tier without a next one beyond it", () => {
    const badges = computePanelBadges({ ...base, lifetimeCounted: 120 });
    expect(byId(badges, "volume_100")?.earned).toBe(true);
    // no hay tier por encima de 100, así que no hay locked extra
    const volumeBadges = badges.filter((b) => b.id.startsWith("volume_"));
    expect(volumeBadges.every((b) => b.earned)).toBe(true);
  });

  it("handles the five-star collector tiers", () => {
    const badges = computePanelBadges({ ...base, fiveStarCount: 12 });
    expect(byId(badges, "five_star_10")?.earned).toBe(true);
    expect(byId(badges, "five_star_25")?.earned).toBe(false);
  });
});
