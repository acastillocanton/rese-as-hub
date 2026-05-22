type Item = { id: string; href: string };

/**
 * Calcula qué item de un menú está activo según la URL actual.
 *
 * Reglas:
 *  - Match exacto contra el path del href (ignorando hash) gana siempre.
 *  - Si no, prefix match (`/comerciales/comercial-prueba` activa "comerciales").
 *    Cuando hay varios candidatos por prefix, gana el más específico (href
 *    más largo).
 *
 * Compartido entre `Sidebar` (desktop) y `MobileTabBar` (mobile sales).
 */
export function pickActiveId<T extends Item>(items: T[], pathname: string): string | null {
  for (const item of items) {
    const itemPath = item.href.split("#")[0];
    if (pathname === itemPath) return item.id;
  }
  const sorted = [...items].sort(
    (a, b) => b.href.split("#")[0].length - a.href.split("#")[0].length,
  );
  for (const item of sorted) {
    const itemPath = item.href.split("#")[0];
    if (itemPath !== "/" && pathname.startsWith(itemPath + "/")) return item.id;
  }
  return null;
}
