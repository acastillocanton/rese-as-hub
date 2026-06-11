export function cn(...classes: Array<string | false | undefined | null>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Mapa de transliteración cirílico → latino (ruso + bielorruso + ucraniano).
 * Solo letras minúsculas; las mayúsculas se derivan en `transliterateCyrillic`.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", ё: "yo", є: "ye",
  ж: "zh", з: "z", и: "i", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ў: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

/**
 * Convierte caracteres cirílicos a su equivalente latino, preservando la
 * caja (Ж → Zh, ж → zh). Cualquier carácter no cirílico se deja intacto, así
 * que es seguro aplicarlo a nombres ya en latín (José → José). Permite que
 * un nombre como "Марина Кудраўцава" se guarde y enlace como "Marina
 * Kudrautsava" (ver §slug en CLAUDE.md / clientes/actions).
 */
export function transliterateCyrillic(input: string): string {
  let out = "";
  for (const ch of input) {
    const lower = ch.toLowerCase();
    const mapped = CYRILLIC_TO_LATIN[lower];
    if (mapped === undefined) {
      out += ch;
    } else if (ch !== lower && mapped.length > 0) {
      out += mapped.charAt(0).toUpperCase() + mapped.slice(1);
    } else {
      out += mapped;
    }
  }
  return out;
}

export function slugify(input: string): string {
  return transliterateCyrillic(input)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Partículas de apellido que no cuentan como token "propio": se arrastran
 * pegadas al siguiente token (p.ej. "Irion de Caetano" → "Irion de Caetano",
 * no "Irion de"). Cubre castellano/catalán/portugués/italiano/neerlandés.
 */
const SURNAME_PARTICLES = new Set([
  "de", "del", "la", "las", "los", "el", "i", "y",
  "da", "das", "do", "dos", "di", "van", "von", "der", "den",
]);

/**
 * Reduce un nombre completo a "nombre + primer apellido" para generar el slug
 * público del productor (decisión de negocio 2026-06-11: el enlace /c/{slug}
 * no debe llevar los dos apellidos). Heurística: primer token + siguiente
 * token no-partícula (las partículas intermedias se arrastran). NO detecta
 * nombres de pila compuestos ("María Jesús" saldría "maria-jesus" sin
 * apellido) — por eso el modal de invitación muestra el slug en un campo
 * EDITABLE para que el admin lo corrija antes de invitar.
 */
export function shortNameForSlug(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return tokens.join(" ");
  const first = tokens[0] as string;
  const rest: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i] as string;
    rest.push(token);
    if (!SURNAME_PARTICLES.has(token.toLowerCase())) break;
  }
  return [first, ...rest].join(" ");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * Formatea un importe en euros con separador decimal español (coma). Sin
 * decimales si es entero; con 2 si no. Ej.: 2 → "2 €", 2.5 → "2,50 €".
 */
export function formatEuro(amount: number): string {
  const isInt = Number.isInteger(amount);
  const n = isInt ? String(amount) : amount.toFixed(2).replace(".", ",");
  return `${n} €`;
}

export function avatarColor(name: string): string {
  const palette = ["#D2D2D7", "#C7C7CC", "#BCBCC1", "#B0B0B6", "#A6A6AB", "#9C9CA1"];
  const code = name.charCodeAt(0) || 65;
  return palette[code % palette.length] ?? "#D2D2D7";
}
