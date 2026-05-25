import { describe, it, expect } from "vitest";
import {
  type Role,
  canManageSales,
  isAdminLike,
  isOfficeDirector,
} from "../supabase/types";

describe("Role helpers (lib/supabase/types)", () => {
  describe("isAdminLike", () => {
    it("acepta admin y office_director", () => {
      expect(isAdminLike("admin")).toBe(true);
      expect(isAdminLike("office_director")).toBe(true);
    });
    it("rechaza sales, reviews_manager, null y undefined", () => {
      expect(isAdminLike("sales")).toBe(false);
      expect(isAdminLike("reviews_manager")).toBe(false);
      expect(isAdminLike(null)).toBe(false);
      expect(isAdminLike(undefined)).toBe(false);
    });
  });

  describe("isOfficeDirector", () => {
    it("solo true para office_director", () => {
      expect(isOfficeDirector("office_director")).toBe(true);
    });
    it("false para el resto", () => {
      const others: (Role | null | undefined)[] = [
        "admin",
        "sales",
        "reviews_manager",
        null,
        undefined,
      ];
      for (const r of others) expect(isOfficeDirector(r)).toBe(false);
    });
  });

  describe("canManageSales", () => {
    it("acepta admin, reviews_manager y office_director", () => {
      expect(canManageSales("admin")).toBe(true);
      expect(canManageSales("reviews_manager")).toBe(true);
      expect(canManageSales("office_director")).toBe(true);
    });
    it("rechaza sales (no se autogestionan) y nulos", () => {
      expect(canManageSales("sales")).toBe(false);
      expect(canManageSales(null)).toBe(false);
      expect(canManageSales(undefined)).toBe(false);
    });
  });
});
