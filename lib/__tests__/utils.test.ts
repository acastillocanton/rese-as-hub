import { describe, expect, it } from "vitest";
import { shortNameForSlug, slugify, transliterateCyrillic } from "@/lib/utils";

describe("transliterateCyrillic", () => {
  it("transliterates a Belarusian name to its Latin form (caso real)", () => {
    // "Марина Кудраўцава" es como entró en Google como "Marina Kudrautsava".
    expect(transliterateCyrillic("Марина Кудраўцава")).toBe("Marina Kudrautsava");
  });

  it("preserves case on multi-char mappings (Ж → Zh, ж → zh)", () => {
    expect(transliterateCyrillic("Жук")).toBe("Zhuk");
    expect(transliterateCyrillic("жук")).toBe("zhuk");
  });

  it("drops soft/hard signs", () => {
    expect(transliterateCyrillic("Игорь")).toBe("Igor");
  });

  it("leaves Latin text (incluso con acentos y ñ) intacto", () => {
    expect(transliterateCyrillic("José Núñez")).toBe("José Núñez");
  });

  it("leaves unmapped scripts untouched", () => {
    expect(transliterateCyrillic("李明")).toBe("李明");
  });
});

describe("slugify", () => {
  it("genera un slug usable a partir de un nombre cirílico (antes salía vacío)", () => {
    expect(slugify("Марина Кудраўцава")).toBe("marina-kudrautsava");
  });

  it("mantiene el comportamiento previo en nombres latinos", () => {
    expect(slugify("José Núñez")).toBe("jose-nunez");
  });

  it("devuelve '' para alfabetos no mapeados (el caller usa su fallback)", () => {
    expect(slugify("李明")).toBe("");
  });
});

describe("shortNameForSlug (nombre + primer apellido, decisión 2026-06-11)", () => {
  it("recorta dos apellidos al primero", () => {
    expect(shortNameForSlug("Tono Sanchez Abadia")).toBe("Tono Sanchez");
    expect(shortNameForSlug("Roberto García Cuellar")).toBe("Roberto García");
  });

  it("deja intacto nombre + un apellido", () => {
    expect(shortNameForSlug("Cornel Popescu")).toBe("Cornel Popescu");
  });

  it("arrastra partículas de apellido", () => {
    expect(shortNameForSlug("Irion de Caetano")).toBe("Irion de Caetano");
    expect(shortNameForSlug("Oscar Rodriguez Lopez Del Campo")).toBe("Oscar Rodriguez");
  });

  it("conserva apellidos con guion como un solo token", () => {
    expect(shortNameForSlug("Ana Fernandez-Avila de Inza")).toBe("Ana Fernandez-Avila");
  });

  it("NO detecta nombres de pila compuestos (limitación documentada — campo editable)", () => {
    // "María Jesús Lozano Giner" debería ser "María Jesús Lozano"; la
    // heurística devuelve "María Jesús". El admin lo corrige en el modal.
    expect(shortNameForSlug("María Jesús Lozano Giner")).toBe("María Jesús");
  });

  it("tolera un solo token y espacios extra", () => {
    expect(shortNameForSlug("Cher")).toBe("Cher");
    expect(shortNameForSlug("  Lucía   Gil   Muñoz ")).toBe("Lucía Gil");
  });

  it("compone con slugify para nombres cirílicos", () => {
    expect(slugify(shortNameForSlug("Марина Кудраўцава"))).toBe("marina-kudrautsava");
  });
});
