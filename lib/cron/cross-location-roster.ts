import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialInfo } from "@/lib/matching/attribute-review";

/** Fila mínima de profiles que necesita el helper. */
type SalesRow = {
  id: string;
  full_name: string;
  status: string;
  location_id: string | null;
  cross_location: boolean;
  role: "sales" | "office_director";
};

/**
 * Añade los productores MULTI-OFICINA (mig 031, "escrituradora": sin
 * location_id fija) al roster `commercialsByLocation` de CADA ficha donde
 * tienen al menos un cliente. Sin esto, el rescate por mención del matcher
 * (§4.38) no podría atribuirles una reseña en esas fichas (no estarían en su
 * roster). La atribución por nombre/tiempo NO lo necesita: va por
 * `share_links.location_id`, que ya apunta a la ficha del cliente.
 *
 * Muta el Map recibido. "Nunca lanza": ante error de la query, no añade nada
 * (el cron sigue; solo se pierde el rescate por mención de esa corrida).
 */
export async function addCrossLocationToRosters(
  admin: SupabaseClient,
  salesRows: SalesRow[],
  commercialsByLocation: Map<string, CommercialInfo[]>,
): Promise<void> {
  const crossProducers = salesRows.filter(
    (s) => s.cross_location && s.status !== "archived",
  );
  if (crossProducers.length === 0) return;

  const { data: crossClients } = await admin
    .from("clients")
    .select("sales_id, location_id")
    .in(
      "sales_id",
      crossProducers.map((s) => s.id),
    )
    .not("location_id", "is", null)
    .returns<{ sales_id: string; location_id: string }[]>();

  const locsByProducer = new Map<string, Set<string>>();
  for (const c of crossClients ?? []) {
    const set = locsByProducer.get(c.sales_id) ?? new Set<string>();
    set.add(c.location_id);
    locsByProducer.set(c.sales_id, set);
  }

  for (const s of crossProducers) {
    const locs = locsByProducer.get(s.id);
    if (!locs) continue;
    for (const locId of locs) {
      const arr = commercialsByLocation.get(locId) ?? [];
      arr.push({ sales_id: s.id, full_name: s.full_name, role: s.role });
      commercialsByLocation.set(locId, arr);
    }
  }
}
