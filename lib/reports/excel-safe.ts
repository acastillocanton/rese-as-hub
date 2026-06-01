/**
 * Defensa contra inyección de fórmulas (CSV/Excel injection).
 *
 * Los nombres de autor y el texto de las reseñas vienen de Google (cualquiera
 * puede poner su display name como `=HYPERLINK(...)`, `+...`, `-...`, `@...`,
 * o `\t`/`\r`). Al abrir el .xlsx, Excel/LibreOffice interpreta como fórmula
 * cualquier celda que empiece por esos caracteres → exfiltración o, peor, DDE.
 *
 * Prefijamos con comilla simple el valor cuando empieza por un disparador de
 * fórmula: Excel lo trata como texto literal y NO ejecuta. Se aplica en el
 * SINK (al escribir la celda), no al ingerir, para no alterar el dato guardado.
 */
export function excelSafe(value: string | null | undefined): string {
  const s = value ?? "";
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
