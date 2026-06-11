import { describe, expect, it } from "vitest";
import { slugify, transliterateCyrillic } from "@/lib/utils";

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
