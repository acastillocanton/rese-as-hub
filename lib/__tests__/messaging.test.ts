import { describe, expect, it } from "vitest";
import {
  getDefaultReviewMessageTemplate,
  getGenericLinkTemplate,
  renderMessage,
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
});
