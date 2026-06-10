import { describe, expect, it } from "vitest";
import { stripGoogleTranslation } from "@/lib/google/strip-translation";

describe("stripGoogleTranslation", () => {
  it("devuelve null cuando el comment es null", () => {
    expect(stripGoogleTranslation(null)).toBeNull();
  });

  it("devuelve null cuando el comment es undefined", () => {
    expect(stripGoogleTranslation(undefined)).toBeNull();
  });

  it("deja el texto intacto cuando no hay traducción incrustada", () => {
    const t = "Joan es un magnífico profesional, trato exquisito.";
    expect(stripGoogleTranslation(t)).toBe(t);
  });

  it("extrae solo el original en el formato real de producción (original primero)", () => {
    const comment =
      "Nos atendieron perfectamente, con mucha dedicación.\n\n(Translated by Google)\nThey took excellent care of us, with great dedication.";
    expect(stripGoogleTranslation(comment)).toBe(
      "Nos atendieron perfectamente, con mucha dedicación.",
    );
  });

  it("preserva la mención al comercial en el original (seguro para el matcher)", () => {
    const comment =
      "We were very satisfied with Katalin. Very helpful.\n\n(Translated by Google)\nEstábamos muy satisfechos con Katalin. Muy atenta.";
    expect(stripGoogleTranslation(comment)).toContain("Katalin");
  });

  it("maneja el formato invertido (traducción primero, original tras (Original))", () => {
    const comment =
      "(Translated by Google) They took excellent care of us.\n\n(Original)\nNos atendieron perfectamente.";
    expect(stripGoogleTranslation(comment)).toBe("Nos atendieron perfectamente.");
  });

  it("recorta espacios sobrantes alrededor del original", () => {
    const comment = "  Texto original.  \n\n(Translated by Google)\nOriginal text.";
    expect(stripGoogleTranslation(comment)).toBe("Texto original.");
  });

  it("devuelve string vacío tal cual (sin traducción)", () => {
    expect(stripGoogleTranslation("")).toBe("");
  });
});
