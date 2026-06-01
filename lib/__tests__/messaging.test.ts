import { describe, expect, it } from "vitest";
import {
  getDefaultReviewMessageTemplate,
  getGenericLinkTemplate,
  MESSAGE_TEMPLATES,
  renderMessage,
  resolveTemplate,
} from "@/lib/messaging";

describe("messaging templates", () => {
  describe("getDefaultReviewMessageTemplate", () => {
    it("includes 'Inseryal by Marina d'Or' for inseryal brand", () => {
      const tpl = getDefaultReviewMessageTemplate("inseryal");
      expect(tpl).toContain("Inseryal by Marina d'Or");
      expect(tpl).not.toContain("Marina d'Or Construcciones");
      expect(tpl).toContain("{nombre_cliente}");
      expect(tpl).toContain("{nombre_comercial}");
      expect(tpl).toContain("{url}");
    });

    it("includes 'Marina d'Or Construcciones' for that brand", () => {
      const tpl = getDefaultReviewMessageTemplate("marina_dor_construcciones");
      expect(tpl).toContain("Marina d'Or Construcciones");
      expect(tpl).not.toContain("Inseryal by Marina d'Or");
    });

    it("renders with brand correctly interpolated", () => {
      const rendered = renderMessage(getDefaultReviewMessageTemplate("inseryal"), {
        nombre_cliente: "Ana",
        nombre_comercial: "Mateo",
        url: "https://example.com/c/mateo/ana",
      });
      expect(rendered).toContain("Hola Ana, soy Mateo de Inseryal by Marina d'Or");
      expect(rendered).toContain("https://example.com/c/mateo/ana");
    });
  });

  describe("getGenericLinkTemplate", () => {
    it("includes 'Inseryal by Marina d'Or' for inseryal brand", () => {
      const tpl = getGenericLinkTemplate("inseryal");
      expect(tpl).toContain("Inseryal by Marina d'Or");
      expect(tpl).toContain("{nombre_comercial}");
      expect(tpl).toContain("{url}");
      // El genérico no usa nombre_cliente.
      expect(tpl).not.toContain("{nombre_cliente}");
    });

    it("includes 'Marina d'Or Construcciones' for that brand", () => {
      const tpl = getGenericLinkTemplate("marina_dor_construcciones");
      expect(tpl).toContain("Marina d'Or Construcciones");
    });
  });

  describe("MESSAGE_TEMPLATES", () => {
    it("has the 3 expected templates in order", () => {
      expect(MESSAGE_TEMPLATES.map((t) => t.id)).toEqual([
        "post_visita",
        "reavivar",
        "breve",
      ]);
    });

    it("post_visita base equals the historical default template", () => {
      const def = MESSAGE_TEMPLATES.find((t) => t.id === "post_visita")!;
      expect(def.build("inseryal")).toBe(getDefaultReviewMessageTemplate("inseryal"));
    });

    it("every base template carries the 3 placeholders and the brand", () => {
      for (const t of MESSAGE_TEMPLATES) {
        const inseryal = t.build("inseryal");
        expect(inseryal, t.id).toContain("{nombre_cliente}");
        expect(inseryal, t.id).toContain("{nombre_comercial}");
        expect(inseryal, t.id).toContain("{url}");
        expect(inseryal, t.id).toContain("Inseryal by Marina d'Or");

        const mdc = t.build("marina_dor_construcciones");
        expect(mdc, t.id).toContain("Marina d'Or Construcciones");
      }
    });
  });

  describe("resolveTemplate", () => {
    it("returns the base template when there are no overrides", () => {
      expect(resolveTemplate("reavivar", "inseryal", null)).toBe(
        MESSAGE_TEMPLATES.find((t) => t.id === "reavivar")!.build("inseryal"),
      );
    });

    it("returns the override when present and non-blank", () => {
      const override = "Mi versión {nombre_cliente} {url}";
      expect(resolveTemplate("breve", "inseryal", { breve: override })).toBe(override);
    });

    it("falls back to base when the override is blank/whitespace", () => {
      expect(resolveTemplate("post_visita", "inseryal", { post_visita: "   " })).toBe(
        getDefaultReviewMessageTemplate("inseryal"),
      );
    });

    it("only applies the override for the matching id", () => {
      const overrides = { reavivar: "solo reavivar {url}" };
      expect(resolveTemplate("breve", "inseryal", overrides)).toBe(
        MESSAGE_TEMPLATES.find((t) => t.id === "breve")!.build("inseryal"),
      );
    });
  });
});
