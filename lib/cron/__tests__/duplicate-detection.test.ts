import { describe, expect, it } from "vitest";
import { decideFromPrincipals } from "@/lib/cron/duplicate-detection";
import { sameGoogleAuthor } from "@/lib/matching/attribute-review";

// Helper para construir principales con menos ruido.
const p = (id: string, at: string, author: string | null) => ({
  id,
  google_created_at: at,
  author_name: author,
});

describe("sameGoogleAuthor", () => {
  it("nombre idéntico → misma cuenta", () => {
    expect(sameGoogleAuthor("Maksim Butakov", "Maksim Butakov")).toBe(true);
  });

  it("cirílico vs su transliteración latina → misma cuenta (clon)", () => {
    // Caso real Ana Prior: "Максим Бутаков" == "Maksim Butakov".
    expect(sameGoogleAuthor("Максим Бутаков", "Maksim Butakov")).toBe(true);
  });

  it("mismo nombre de pila pero apellidos distintos → cuentas DISTINTAS", () => {
    // Caso real Laura: "Ana Plaza" (55) vs "Ana Perez" → no es la misma cuenta.
    expect(sameGoogleAuthor("Ana Plaza", "Ana Perez")).toBe(false);
  });

  it("personas totalmente distintas → cuentas distintas", () => {
    expect(
      sameGoogleAuthor("jose sanchez Garrido", "Maria Jose Moral Valderas"),
    ).toBe(false);
  });

  it("nombre acortado en una edición (subconjunto de tokens) → misma cuenta", () => {
    expect(sameGoogleAuthor("Maksim", "Maksim Butakov")).toBe(true);
  });

  it("anónimo / vacío en cualquier lado → indistinguible = misma cuenta (dedupe conservador)", () => {
    expect(sameGoogleAuthor("", "Maksim Butakov")).toBe(true);
    expect(sameGoogleAuthor("Maksim Butakov", null)).toBe(true);
    expect(sameGoogleAuthor(null, undefined)).toBe(true);
  });
});

describe("decideFromPrincipals (dedupe por cliente + misma cuenta)", () => {
  it("sin principales previas → no es duplicada", () => {
    const r = decideFromPrincipals([], "2026-05-26T10:00:00Z", "Ana Plaza");
    expect(r).toEqual({ newIsDuplicate: false, demotedReviewId: null });
  });

  it("MISMA cuenta, entrante posterior → duplicada", () => {
    const r = decideFromPrincipals(
      [p("p1", "2026-05-26T10:00:00Z", "Maksim Butakov")],
      "2026-05-26T11:00:00Z",
      "Maksim Butakov",
    );
    expect(r).toEqual({ newIsDuplicate: true, demotedReviewId: null });
  });

  it("MISMA cuenta, entrante más antigua → invierte (demota la vieja)", () => {
    const r = decideFromPrincipals(
      [p("p1", "2026-05-26T11:00:00Z", "Maksim Butakov")],
      "2026-05-26T10:00:00Z",
      "Maksim Butakov",
    );
    expect(r).toEqual({ newIsDuplicate: false, demotedReviewId: "p1" });
  });

  it("MISMA cuenta, empate exacto → la entrante se marca duplicada", () => {
    const r = decideFromPrincipals(
      [p("p1", "2026-05-26T10:00:00Z", "Maksim Butakov")],
      "2026-05-26T10:00:00Z",
      "Maksim Butakov",
    );
    expect(r).toEqual({ newIsDuplicate: true, demotedReviewId: null });
  });

  it("clon cirílico/latino misma persona → duplicada (no se paga dos veces)", () => {
    // Caso Ana Prior: principal "Максим Бутаков", entra "Maksim Butakov".
    const r = decideFromPrincipals(
      [p("p1", "2026-06-23T09:38:44Z", "Максим Бутаков")],
      "2026-06-23T09:38:44Z",
      "Maksim Butakov",
    );
    expect(r).toEqual({ newIsDuplicate: true, demotedReviewId: null });
  });

  it("CUENTA DISTINTA en el mismo cliente (pareja) → NO es duplicada, cuenta", () => {
    // Caso Laura: principal "Ana Plaza" (06-jul); entra "Ana Perez" (07-jul)
    // en el mismo enlace/cliente. Son cuentas distintas → ambas cuentan.
    const r = decideFromPrincipals(
      [p("p1", "2026-07-06T15:02:20Z", "Ana Plaza")],
      "2026-07-07T19:12:03Z",
      "Ana Perez",
    );
    expect(r).toEqual({ newIsDuplicate: false, demotedReviewId: null });
  });

  it("caso Úrsula: dos autores distintos en cliente genérico 'jose' → NO duplicada", () => {
    const r = decideFromPrincipals(
      [p("p1", "2026-07-08T15:32:58Z", "jose sanchez Garrido")],
      "2026-07-09T15:43:59Z",
      "Maria Jose Moral Valderas",
    );
    expect(r).toEqual({ newIsDuplicate: false, demotedReviewId: null });
  });

  it("anónimo entrante con principal nombrada → duplicada (conservador)", () => {
    const r = decideFromPrincipals(
      [p("p1", "2026-05-26T10:00:00Z", "Ana Plaza")],
      "2026-05-26T11:00:00Z",
      "", // anónimo
    );
    expect(r).toEqual({ newIsDuplicate: true, demotedReviewId: null });
  });

  it("varias principales de cuentas distintas: solo compite contra la de su cuenta", () => {
    const principals = [
      p("otra", "2026-05-26T08:00:00Z", "Ana Perez"), // otra cuenta, se ignora
      p("mia", "2026-05-26T12:00:00Z", "Maksim Butakov"), // mi cuenta
    ];
    // Entra "Maksim" posterior a "mia" (12:00) → duplicada de su cuenta,
    // sin importar que "otra" (08:00) sea más antigua.
    const r = decideFromPrincipals(
      principals,
      "2026-05-26T13:00:00Z",
      "Maksim Butakov",
    );
    expect(r).toEqual({ newIsDuplicate: true, demotedReviewId: null });
  });

  it("estado inconsistente (2 principales de la MISMA cuenta): compara contra la más antigua", () => {
    const principals = [
      p("p2", "2026-05-26T12:00:00Z", "Maksim Butakov"),
      p("p1", "2026-05-26T08:00:00Z", "Maksim Butakov"),
    ];
    const r = decideFromPrincipals(
      principals,
      "2026-05-26T07:00:00Z",
      "Maksim Butakov",
    );
    expect(r).toEqual({ newIsDuplicate: false, demotedReviewId: "p1" });
  });

  it("flujo cron: pareja (2 cuentas) en el mismo cliente → ambas principales", () => {
    let principals: ReturnType<typeof p>[] = [];

    // Entra ella (Ana Plaza).
    const r1 = decideFromPrincipals(principals, "2026-07-06T15:00:00Z", "Ana Plaza");
    expect(r1.newIsDuplicate).toBe(false);
    principals = [p("rev1", "2026-07-06T15:00:00Z", "Ana Plaza")];

    // Entra él (Ana Perez) — cuenta distinta → NO duplicada, ambas cuentan.
    const r2 = decideFromPrincipals(principals, "2026-07-07T19:00:00Z", "Ana Perez");
    expect(r2.newIsDuplicate).toBe(false);
    expect(r2.demotedReviewId).toBeNull();
  });

  it("flujo cron: MISMA cuenta 3 veces → solo la 1ª cuenta", () => {
    let principals: ReturnType<typeof p>[] = [];

    const r1 = decideFromPrincipals(principals, "2026-05-26T10:00:00Z", "Pepe López");
    expect(r1.newIsDuplicate).toBe(false);
    principals = [p("rev1", "2026-05-26T10:00:00Z", "Pepe López")];

    const r2 = decideFromPrincipals(principals, "2026-05-26T11:00:00Z", "Pepe López");
    expect(r2.newIsDuplicate).toBe(true);

    const r3 = decideFromPrincipals(principals, "2026-05-26T12:00:00Z", "Pepe López");
    expect(r3.newIsDuplicate).toBe(true);
  });
});
