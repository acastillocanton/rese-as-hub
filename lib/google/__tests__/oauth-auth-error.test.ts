import { describe, expect, it } from "vitest";
import { isOAuthAuthError } from "../business-profile";

describe("isOAuthAuthError", () => {
  it("detecta el token muerto (invalid_grant del refresh)", () => {
    expect(
      isOAuthAuthError(
        'Token refresh failed (400): {\n  "error": "invalid_grant",\n  "error_description": "Token has been expired or revoked."\n}',
      ),
    ).toBe(true);
  });

  it("detecta la falta de refresh token", () => {
    expect(isOAuthAuthError("no_refresh_token")).toBe(true);
  });

  it("detecta scope insuficiente (403 ACCESS_TOKEN_SCOPE_INSUFFICIENT)", () => {
    expect(
      isOAuthAuthError(
        'listAccounts failed (403): {"error":{"status":"PERMISSION_DENIED","details":[{"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}',
      ),
    ).toBe(true);
  });

  it("detecta 'insufficient authentication scopes'", () => {
    expect(
      isOAuthAuthError("Request had insufficient authentication scopes."),
    ).toBe(true);
  });

  it("detecta invalid_client", () => {
    expect(isOAuthAuthError('Token refresh failed (401): {"error":"invalid_client"}')).toBe(true);
  });

  it("detecta token exchange failed (alta inicial)", () => {
    expect(isOAuthAuthError("Token exchange failed (400): invalid_grant")).toBe(true);
  });

  it("detecta 401 / unauthenticated", () => {
    expect(isOAuthAuthError("listReviews failed (401): UNAUTHENTICATED")).toBe(true);
  });

  it("es insensible a mayúsculas", () => {
    expect(isOAuthAuthError("INVALID_GRANT")).toBe(true);
  });

  // --- Negativos: transitorios NO deben marcar la ficha como error ---
  it("NO marca un 500 transitorio", () => {
    expect(isOAuthAuthError("listReviews failed (500): internal error")).toBe(false);
  });

  it("NO marca un 503", () => {
    expect(isOAuthAuthError("listReviews failed (503): service unavailable")).toBe(false);
  });

  it("NO marca un 429 (rate limit)", () => {
    expect(isOAuthAuthError("listReviews failed (429): RESOURCE_EXHAUSTED")).toBe(false);
  });

  it("NO marca un fallo de red / timeout", () => {
    expect(isOAuthAuthError("fetch failed: network timeout")).toBe(false);
  });

  it("NO marca skipped_concurrent_run", () => {
    expect(isOAuthAuthError("skipped_concurrent_run")).toBe(false);
  });

  it("trata null/undefined/'' como no-auth", () => {
    expect(isOAuthAuthError(null)).toBe(false);
    expect(isOAuthAuthError(undefined)).toBe(false);
    expect(isOAuthAuthError("")).toBe(false);
  });
});
