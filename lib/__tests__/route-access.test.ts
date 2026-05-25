import { describe, it, expect } from "vitest";
import { pathAllowedForRole } from "../supabase/middleware";

// Estos tests fijan la matriz de acceso por rol. Cualquier cambio en
// pathAllowedForRole debe ir acompañado de un cambio aquí.

describe("pathAllowedForRole — admin", () => {
  it("ve todo (excluyendo público; el middleware ya gestiona eso aparte)", () => {
    const paths = [
      "/dashboard",
      "/comerciales",
      "/comerciales/foo",
      "/gestores",
      "/fichas",
      "/fichas/abc/conectar",
      "/resenas/verificacion",
      "/ajustes",
      "/manager/resenas",
      "/manager/export",
      "/api/export/reviews",
      "/api/sync/now",
      "/api/google/oauth/start",
    ];
    for (const p of paths) expect(pathAllowedForRole(p, "admin"), p).toBe(true);
  });
});

describe("pathAllowedForRole — sales", () => {
  it("solo /panel, /clientes, /perfil, /ayuda", () => {
    expect(pathAllowedForRole("/panel", "sales")).toBe(true);
    expect(pathAllowedForRole("/panel/ranking", "sales")).toBe(true);
    expect(pathAllowedForRole("/clientes", "sales")).toBe(true);
    expect(pathAllowedForRole("/clientes/foo", "sales")).toBe(true);
    expect(pathAllowedForRole("/perfil", "sales")).toBe(true);
    expect(pathAllowedForRole("/ayuda", "sales")).toBe(true);
  });
  it("NO entra a admin ni a manager", () => {
    expect(pathAllowedForRole("/dashboard", "sales")).toBe(false);
    expect(pathAllowedForRole("/comerciales", "sales")).toBe(false);
    expect(pathAllowedForRole("/fichas", "sales")).toBe(false);
    expect(pathAllowedForRole("/gestores", "sales")).toBe(false);
    expect(pathAllowedForRole("/ajustes", "sales")).toBe(false);
    expect(pathAllowedForRole("/manager/resenas", "sales")).toBe(false);
    expect(pathAllowedForRole("/api/export/reviews", "sales")).toBe(false);
  });
});

describe("pathAllowedForRole — reviews_manager", () => {
  it("dashboard + comerciales + manager + export", () => {
    expect(pathAllowedForRole("/dashboard", "reviews_manager")).toBe(true);
    expect(pathAllowedForRole("/comerciales", "reviews_manager")).toBe(true);
    expect(pathAllowedForRole("/comerciales/foo", "reviews_manager")).toBe(true);
    expect(pathAllowedForRole("/manager/resenas", "reviews_manager")).toBe(true);
    expect(pathAllowedForRole("/manager/export", "reviews_manager")).toBe(true);
    expect(pathAllowedForRole("/api/export/reviews", "reviews_manager")).toBe(true);
    expect(pathAllowedForRole("/perfil", "reviews_manager")).toBe(true);
    expect(pathAllowedForRole("/ayuda", "reviews_manager")).toBe(true);
  });
  it("NO entra a /fichas, /gestores, /ajustes, /resenas/verificacion", () => {
    expect(pathAllowedForRole("/fichas", "reviews_manager")).toBe(false);
    expect(pathAllowedForRole("/gestores", "reviews_manager")).toBe(false);
    expect(pathAllowedForRole("/ajustes", "reviews_manager")).toBe(false);
    expect(pathAllowedForRole("/resenas/verificacion", "reviews_manager")).toBe(false);
  });
});

describe("pathAllowedForRole — office_director (dualidad gestor + comercial)", () => {
  it("admin de equipo + comercial productor: dashboard, comerciales, fichas, verificación, export, panel, clientes", () => {
    expect(pathAllowedForRole("/dashboard", "office_director")).toBe(true);
    expect(pathAllowedForRole("/comerciales", "office_director")).toBe(true);
    expect(pathAllowedForRole("/comerciales/foo", "office_director")).toBe(true);
    expect(pathAllowedForRole("/fichas", "office_director")).toBe(true);
    expect(pathAllowedForRole("/fichas/abc/conectar", "office_director")).toBe(true);
    expect(pathAllowedForRole("/resenas/verificacion", "office_director")).toBe(true);
    expect(pathAllowedForRole("/manager/export", "office_director")).toBe(true);
    expect(pathAllowedForRole("/api/export/reviews", "office_director")).toBe(true);
    expect(pathAllowedForRole("/api/sync/now", "office_director")).toBe(true);
    expect(pathAllowedForRole("/api/google/oauth/start", "office_director")).toBe(true);
    expect(pathAllowedForRole("/perfil", "office_director")).toBe(true);
    expect(pathAllowedForRole("/ayuda", "office_director")).toBe(true);
    // Producer (vende): panel + clientes
    expect(pathAllowedForRole("/panel", "office_director")).toBe(true);
    expect(pathAllowedForRole("/panel/enlace", "office_director")).toBe(true);
    expect(pathAllowedForRole("/panel/resenas", "office_director")).toBe(true);
    expect(pathAllowedForRole("/panel/ranking", "office_director")).toBe(true);
    expect(pathAllowedForRole("/clientes", "office_director")).toBe(true);
    expect(pathAllowedForRole("/clientes/foo", "office_director")).toBe(true);
  });
  it("NO entra a /gestores, /directores, /ajustes ni /manager/resenas", () => {
    expect(pathAllowedForRole("/gestores", "office_director")).toBe(false);
    expect(pathAllowedForRole("/directores", "office_director")).toBe(false);
    expect(pathAllowedForRole("/directores/foo", "office_director")).toBe(false);
    expect(pathAllowedForRole("/ajustes", "office_director")).toBe(false);
    expect(pathAllowedForRole("/manager/resenas", "office_director")).toBe(false);
    expect(pathAllowedForRole("/manager/resenas/importar", "office_director")).toBe(false);
    expect(pathAllowedForRole("/api/admin/notify-failed", "office_director")).toBe(false);
  });
});
