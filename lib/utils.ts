export function cn(...classes: Array<string | false | undefined | null>): string {
  return classes.filter(Boolean).join(" ");
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export function avatarColor(name: string): string {
  const palette = ["#D2D2D7", "#C7C7CC", "#BCBCC1", "#B0B0B6", "#A6A6AB", "#9C9CA1"];
  const code = name.charCodeAt(0) || 65;
  return palette[code % palette.length];
}
