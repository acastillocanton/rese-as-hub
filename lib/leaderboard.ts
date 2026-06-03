import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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
 * El sort es estable: reviews DESC, full_name ASC (para que el orden de
 * productores con 0 reseñas sea determinista en tests). `visits` se sigue
 * calculando como dato útil interno (compatibilidad con tests y campos
 * que algún componente puede mostrar a futuro), pero NO se usa para
 * ordenar — las visitas no son un KPI accionable según decisión de
 * producto.
 */

export type LeaderboardSales = {
  id: string;
  full_name: string;
  slug: string;
  status: string;
  monthly_goal: number;
  location_id: string | null;
  role: "sales" | "office_director";
  /** Foto de perfil; opcional para no romper fixtures de tests. */
  avatar_url?: string | null;
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
  /** visits/conv se calculan por compatibilidad pero NO se muestran en ninguna
   *  pantalla (las visitas dejaron de ser KPI accionable, ver CLAUDE.md §4.30).
   *  Se conservan por si se reactivan; eliminar si tras tiempo siguen sin uso. */
  visits: number;
  reviews: number;
  counted: number;
  /** Conversión visitas → reseñas, 0..100 (entero). Ver nota de `visits`. */
  conv: number;
  goal: number;
  isDirector: boolean;
  /** Foto de perfil del productor (o null → la card pinta iniciales). */
  avatarUrl: string | null;
  /** Marca la fila correspondiente al usuario actual (rol sales viendo
   *  /panel/ranking). Lo usa LeaderboardCardList para destacar visualmente
   *  la card del propio comercial. */
  isSelf: boolean;
};

export function computeLeaderboard(args: {
  sales: LeaderboardSales[];
  locations: LeaderboardLocation[];
  shares: LeaderboardShare[];
  reviews: LeaderboardReview[];
  /** Si se pasa, la fila con `id === currentUserId` se marca con `isSelf: true`. */
  currentUserId?: string;
  /**
   * Métrica de ordenación:
   *   - "reviews" (default): por reseñas atribuidas no-duplicadas (uso admin).
   *   - "counted": por reseñas VERIFICADAS (abonables). Lo usa el panel del
   *     comercial para que la posición/"Líder" sea coherente con la comisión.
   */
  metric?: "reviews" | "counted";
}): LeaderboardRow[] {
  const { sales, locations, shares, reviews, currentUserId, metric = "reviews" } = args;

  // Índice por id para evitar O(n·m) con locations.find dentro del map.
  const locationById = new Map<string, LeaderboardLocation>();
  for (const l of locations) locationById.set(l.id, l);

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
      const location = s.location_id ? locationById.get(s.location_id) : undefined;
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
        avatarUrl: s.avatar_url ?? null,
        isSelf: currentUserId !== undefined && s.id === currentUserId,
      };
    })
    .sort(
      (a, b) =>
        (metric === "counted" ? b.counted - a.counted : b.reviews - a.reviews) ||
        a.name.localeCompare(b.name, "es"),
    );
}

/**
 * Versión server-only que hace la query mínima y devuelve el leaderboard
 * para un rango temporal dado (ISO inclusivo-exclusivo).
 *
 * Por defecto respeta RLS del caller (admin/manager ven todos;
 * office_director ve su equipo automáticamente por migración 013).
 *
 * `teamFilter` activa el modo "ranking del propio equipo del rol sales":
 *   - Usa service-role (porque RLS de profiles bloquea a sales leer otros perfiles).
 *   - Filtra `profiles` por `director_id` (o `is null` si el sales es huérfano).
 *   - El filtro lo decide el server desde la sesión, no es un query-param
 *     del usuario, así que no hay vector de escalada.
 *
 * `currentUserId` se propaga a `computeLeaderboard` para marcar la fila
 * propia con `isSelf=true` (highlight visual).
 */
export async function getLeaderboard(opts: {
  startIso: string;
  endIso: string;
  teamFilter?: { directorId: string | null };
  currentUserId?: string;
  /** Métrica de orden — ver computeLeaderboard. Default "reviews". */
  metric?: "reviews" | "counted";
}): Promise<LeaderboardRow[]> {
  // Path "ranking del propio equipo del rol sales": usa service-role porque
  // RLS de profiles bloquea a un sales leer otros perfiles. Filtro server-side
  // por `director_id` desde la sesión — no es un query-param del usuario.
  if (opts.teamFilter) {
    const svc = createServiceClient();
    const salesQuery = svc
      .from("profiles")
      .select("id, full_name, slug, status, monthly_goal, location_id, role, avatar_url")
      .in("role", ["sales", "office_director"]);
    const filteredSales =
      opts.teamFilter.directorId === null
        ? salesQuery.is("director_id", null)
        : salesQuery.eq("director_id", opts.teamFilter.directorId);

    const [salesRes, locationsRes, sharesRes, reviewsRes] = await Promise.all([
      filteredSales.returns<LeaderboardSales[]>(),
      svc.from("locations").select("id, name").returns<LeaderboardLocation[]>(),
      svc
        .from("share_links")
        .select("sales_id")
        .gte("opened_at", opts.startIso)
        .lt("opened_at", opts.endIso)
        .returns<LeaderboardShare[]>(),
      svc
        .from("reviews")
        .select("sales_id, match_state")
        .is("removed_at", null)
        .eq("is_duplicate", false)
        .gte("google_created_at", opts.startIso)
        .lt("google_created_at", opts.endIso)
        .returns<LeaderboardReview[]>(),
    ]);

    return computeLeaderboard({
      sales: salesRes.data ?? [],
      locations: locationsRes.data ?? [],
      shares: sharesRes.data ?? [],
      reviews: reviewsRes.data ?? [],
      currentUserId: opts.currentUserId,
      metric: opts.metric,
    });
  }

  // Path por defecto: RLS-driven (admin/manager ven todo, director ve su
  // equipo por migración 013).
  const supabase = await createClient();
  const [salesRes, locationsRes, sharesRes, reviewsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, slug, status, monthly_goal, location_id, role, avatar_url")
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
      .eq("is_duplicate", false)
      .gte("google_created_at", opts.startIso)
      .lt("google_created_at", opts.endIso)
      .returns<LeaderboardReview[]>(),
  ]);

  return computeLeaderboard({
    sales: salesRes.data ?? [],
    locations: locationsRes.data ?? [],
    shares: sharesRes.data ?? [],
    reviews: reviewsRes.data ?? [],
    currentUserId: opts.currentUserId,
    metric: opts.metric,
  });
}
