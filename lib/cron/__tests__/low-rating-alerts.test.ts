import { describe, expect, it } from "vitest";
import {
  LOW_RATING_THRESHOLD,
  isLowRating,
  resolveLowRatingRecipients,
  type ProfileLite,
  type SalesLite,
} from "@/lib/cron/low-rating-alerts";

describe("LOW_RATING_THRESHOLD", () => {
  it("es 2 (1★ y 2★ disparan alerta; 3★ ya no)", () => {
    expect(LOW_RATING_THRESHOLD).toBe(2);
  });
});

describe("isLowRating", () => {
  it("true para 1 y 2", () => {
    expect(isLowRating(1)).toBe(true);
    expect(isLowRating(2)).toBe(true);
  });
  it("false para 3, 4, 5", () => {
    expect(isLowRating(3)).toBe(false);
    expect(isLowRating(4)).toBe(false);
    expect(isLowRating(5)).toBe(false);
  });
  it("false para valores edge (0, negativos, NaN, Infinity)", () => {
    expect(isLowRating(0)).toBe(false);
    expect(isLowRating(-1)).toBe(false);
    expect(isLowRating(Number.NaN)).toBe(false);
    expect(isLowRating(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

function admin(email: string, status: "active" | "paused" = "active"): ProfileLite {
  return { id: `admin-${email}`, email, status };
}
function manager(email: string, status: "active" | "paused" = "active"): ProfileLite {
  return { id: `mgr-${email}`, email, status };
}
function sales(
  email: string | null,
  options: {
    status?: "active" | "paused" | "archived" | "invited";
    director_id?: string | null;
    id?: string;
  } = {},
): SalesLite {
  return {
    id: options.id ?? "sales-1",
    email,
    status: options.status ?? "active",
    director_id: options.director_id ?? null,
  };
}
function director(email: string | null, status: "active" | "paused" = "active"): ProfileLite {
  return { id: "dir-1", email, status };
}

describe("resolveLowRatingRecipients", () => {
  it("unmatched: solo admin + manager (sin sales ni director)", () => {
    const out = resolveLowRatingRecipients({
      matchState: "unmatched",
      sales: null,
      director: null,
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out.sort()).toEqual(["admin@x.com", "bel@x.com"].sort());
  });

  it("counted con sales activo: incluye al sales", () => {
    const out = resolveLowRatingRecipients({
      matchState: "counted",
      sales: sales("judit@x.com"),
      director: null,
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out.sort()).toEqual(["admin@x.com", "bel@x.com", "judit@x.com"].sort());
  });

  it("counted con sales sin email: admin + manager + director (sin sales)", () => {
    const out = resolveLowRatingRecipients({
      matchState: "counted",
      sales: sales(null),
      director: director("roberto@x.com"),
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out.sort()).toEqual(
      ["admin@x.com", "bel@x.com", "roberto@x.com"].sort(),
    );
  });

  it("counted con director activo: incluye al director", () => {
    const out = resolveLowRatingRecipients({
      matchState: "counted",
      sales: sales("judit@x.com"),
      director: director("roberto@x.com"),
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out.sort()).toEqual(
      ["admin@x.com", "bel@x.com", "judit@x.com", "roberto@x.com"].sort(),
    );
  });

  it("dedupe cuando sales y director comparten email (productor dual)", () => {
    // Caso director productor: el director es el propio sales atribuido,
    // su profile sale como sales (matcher) y también como director del
    // sales. Mismo email → debe aparecer una sola vez.
    const out = resolveLowRatingRecipients({
      matchState: "counted",
      sales: sales("dual@x.com"),
      director: director("dual@x.com"),
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out.filter((e) => e === "dual@x.com")).toHaveLength(1);
    expect(out.sort()).toEqual(
      ["admin@x.com", "bel@x.com", "dual@x.com"].sort(),
    );
  });

  it("dedupe case-insensitive", () => {
    const out = resolveLowRatingRecipients({
      matchState: "counted",
      sales: sales("Judit@X.COM"),
      director: director("judit@x.com"),
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out.filter((e) => e.toLowerCase() === "judit@x.com")).toHaveLength(1);
  });

  it("2 admins + 2 managers: todos incluidos", () => {
    const out = resolveLowRatingRecipients({
      matchState: "unmatched",
      sales: null,
      director: null,
      admins: [admin("alejandro@x.com"), admin("rafa@x.com")],
      managers: [manager("bel@x.com"), manager("jose@x.com")],
    });
    expect(out.sort()).toEqual(
      ["alejandro@x.com", "rafa@x.com", "bel@x.com", "jose@x.com"].sort(),
    );
  });

  it("sales status=paused: excluido", () => {
    const out = resolveLowRatingRecipients({
      matchState: "counted",
      sales: sales("judit@x.com", { status: "paused" }),
      director: null,
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out).not.toContain("judit@x.com");
    expect(out.sort()).toEqual(["admin@x.com", "bel@x.com"].sort());
  });

  it("sales status=archived: excluido", () => {
    const out = resolveLowRatingRecipients({
      matchState: "counted",
      sales: sales("judit@x.com", { status: "archived" }),
      director: null,
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out).not.toContain("judit@x.com");
  });

  it("director status=paused: excluido", () => {
    const out = resolveLowRatingRecipients({
      matchState: "counted",
      sales: sales("judit@x.com"),
      director: director("roberto@x.com", "paused"),
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out).not.toContain("roberto@x.com");
  });

  it("admin status=paused: excluido", () => {
    const out = resolveLowRatingRecipients({
      matchState: "unmatched",
      sales: null,
      director: null,
      admins: [admin("admin1@x.com"), admin("admin2@x.com", "paused")],
      managers: [manager("bel@x.com")],
    });
    expect(out).toContain("admin1@x.com");
    expect(out).not.toContain("admin2@x.com");
  });

  it("pending: trata como counted (incluye sales y director)", () => {
    const out = resolveLowRatingRecipients({
      matchState: "pending",
      sales: sales("judit@x.com"),
      director: director("roberto@x.com"),
      admins: [admin("admin@x.com")],
      managers: [manager("bel@x.com")],
    });
    expect(out).toContain("judit@x.com");
    expect(out).toContain("roberto@x.com");
  });

  it("emails con espacios → trimmed antes de devolver", () => {
    const out = resolveLowRatingRecipients({
      matchState: "unmatched",
      sales: null,
      director: null,
      admins: [admin("  admin@x.com  ")],
      managers: [],
    });
    expect(out).toEqual(["admin@x.com"]);
  });

  it("lista de admins vacía: posible si nadie está activo (devuelve lo que haya)", () => {
    const out = resolveLowRatingRecipients({
      matchState: "unmatched",
      sales: null,
      director: null,
      admins: [],
      managers: [],
    });
    expect(out).toEqual([]);
  });
});
