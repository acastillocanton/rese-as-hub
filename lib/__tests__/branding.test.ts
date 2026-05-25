import { describe, expect, it } from "vitest";
import {
  BRAND_OPTIONS,
  DEFAULT_BRAND,
  getBrandBreadcrumb,
  getBrandEmailLogo,
  getBrandLabel,
} from "@/lib/branding";

describe("branding helpers", () => {
  it("DEFAULT_BRAND is 'inseryal'", () => {
    expect(DEFAULT_BRAND).toBe("inseryal");
  });

  describe("getBrandLabel", () => {
    it("returns the full label for inseryal", () => {
      expect(getBrandLabel("inseryal")).toBe("Inseryal by Marina d'Or");
    });

    it("returns the full label for marina_dor_construcciones", () => {
      expect(getBrandLabel("marina_dor_construcciones")).toBe("Marina d'Or Construcciones");
    });
  });

  describe("getBrandBreadcrumb", () => {
    it("returns short label for inseryal", () => {
      expect(getBrandBreadcrumb("inseryal")).toBe("Inseryal");
    });

    it("returns short label for marina_dor_construcciones", () => {
      expect(getBrandBreadcrumb("marina_dor_construcciones")).toBe("Marina d'Or");
    });
  });

  describe("getBrandEmailLogo", () => {
    it("returns an https URL for inseryal logo", () => {
      const logo = getBrandEmailLogo("inseryal");
      expect(logo.url).toMatch(/^https:\/\/inseryal\.es\/.+\.png$/);
      expect(logo.alt).toBe("Inseryal by Marina d'Or");
      expect(logo.linkHref).toBe("https://inseryal.es");
    });

    it("returns an https URL for marina_dor_construcciones logo", () => {
      const logo = getBrandEmailLogo("marina_dor_construcciones");
      expect(logo.url).toMatch(/^https:\/\/marinadorconstrucciones\.com\/.+\.(webp|png|svg|jpg)$/);
      expect(logo.alt).toBe("Marina d'Or Construcciones");
      expect(logo.linkHref).toBe("https://marinadorconstrucciones.com");
    });
  });

  describe("BRAND_OPTIONS", () => {
    it("has exactly 2 entries", () => {
      expect(BRAND_OPTIONS).toHaveLength(2);
    });

    it("each entry's label matches getBrandLabel(value)", () => {
      for (const opt of BRAND_OPTIONS) {
        expect(opt.label).toBe(getBrandLabel(opt.value));
      }
    });
  });
});
