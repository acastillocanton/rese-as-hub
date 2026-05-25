import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Helper compartido del leaderboard de productores (sales + office_director).
 *
 * Dos APIs:
 *   - `computeLeaderboard(...)`: función PURA que recibe los datos ya cargados
 *     y devuelve las filas ordenadas. Es lo que consume el dashboard, que ya
 *     tiene `sales`, `locations`, `shares` y `reviews` cargados para otros KPIs.
 *   - `getLeaderboard({ from, to })`: hace su propia query (mínima) y llama a
 *     `computeLeaderboard`. Es lo que consume la pantalla `/ranking`.
 *
 * El sort es estable: reviews DESC, visits DESC, full_name ASC (para que el
 * orden de productores con 0/0 sea determinista en tests).
 */

export type LeaderboardSales = {
  id: string;
  full_name: string;
  slug: string;
  status: string;
  monthly_goal: number;
  location_id: string | null;
  role: "sales" | "office_director";
};

export type LeaderboardLocation = {
  id: string;
  name: string;
};

export type LeaderboardShare = {
  sales_id: string;
};

export type LeaderboardReview = {
  sales_id: string | null;
  match_state: string;
};

export type LeaderboardRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  branch: string;
  visits: number;
  reviews: number;
  counted: number;
  /** Conversión visitas → reseñas, 0..100 (entero). */
  conv: number;
  goal: number;
  isDirector: boolean;
};

export function computeLeaderboard(args: {
  sales: LeaderboardSales[];
  locations: LeaderboardLocation[];
  shares: LeaderboardShare[];
  reviews: LeaderboardReview[];
}): LeaderboardRow[] {
  const { sales, locations, shares, reviews } = args;

  const sharesBySales = new Map<string, number>();
  for (const s of shares) {
    sharesBySales.set(s.sales_id, (sharesBySales.get(s.sales_id) ?? 0) + 1);
  }

  const reviewsBySales = new Map<string, number>();
  const reviewsCountedBySales = new Map<string, number>();
  for (const r of reviews) {
    if (!r.sales_id) continue;
    reviewsBySales.set(r.sales_id, (reviewsBySales.get(r.sales_id) ?? 0) + 1);
    if (r.match_state === "counted") {
      reviewsCountedBySales.set(
        r.sales_id,
        (reviewsCountedBySales.get(r.sales_id) ?? 0) + 1,
      );
    }
  }

  return sales
    .map((s) => {
      const location = locations.find((l) => l.id === s.location_id);
      const visits = sharesBySales.get(s.id) ?? 0;
      const reviewsN = reviewsBySales.get(s.id) ?? 0;
      const counted = reviewsCountedBySales.get(s.id) ?? 0;
      const conv = visits > 0 ? Math.round((reviewsN / visits) * 100) : 0;
      return {
        id: s.id,
        slug: s.slug,
        name: s.full_name,
        status: s.status,
        branch: location?.name ?? "—",
        visits,
        reviews: reviewsN,
        counted,
        conv,
        goal: s.monthly_goal,
        isDirector: s.role === "office_director",
      };
    })
    .sort(
      (a, b) =>
        b.reviews - a.reviews ||
        b.visits - a.visits ||
        a.name.localeCompare(b.name, "es"),
    );
}

/**
 * Versión server-only que hace la query mínima y devuelve el leaderboard
 * para un rango temporal dado (ISO inclusivo-exclusivo). Respeta RLS: si el
 * caller es office_director, Supabase filtra automáticamente sales/reviews
 * a su equipo (migración 013).
 */
export async function getLeaderboard(opts: {
  startIso: string;
  endIso: string;
}): Promise<LeaderboardRow[]> {
  const supabase = await createClient();

  const [salesRes, locationsRes, sharesRes, reviewsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, slug, status, monthly_goal, location_id, role")
      .in("role", ["sales", "office_director"])
      .returns<LeaderboardSales[]>(),
    supabase
      .from("locations")
      .select("id, name")
      .returns<LeaderboardLocation[]>(),
    supabase
      .from("share_links")
      .select("sales_id")
      .gte("opened_at", opts.startIso)
      .lt("opened_at", opts.endIso)
      .returns<LeaderboardShare[]>(),
    supabase
      .from("reviews")
      .select("sales_id, match_state")
      .is("removed_at", null)
      .gte("google_created_at", opts.startIso)
      .lt("google_created_at", opts.endIso)
      .returns<LeaderboardReview[]>(),
  ]);

  return computeLeaderboard({
    sales: salesRes.data ?? [],
    locations: locationsRes.data ?? [],
    shares: sharesRes.data ?? [],
    reviews: reviewsRes.data ?? [],
  });
}
