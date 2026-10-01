import { describe, expect, it } from "vitest";
import { buildAuthConfirmationPage } from "@/lib/auth/confirm-page";

describe("auth confirm guard", () => {
  it("solo presenta el token para verificación tras un submit POST deliberado", () => {
    const html = buildAuthConfirmationPage({
      tokenHash: "abc123",
      type: "magiclink",
      next: "/panel",
    });

    expect(html).toContain("Confirmar acceso");
    expect(html).toContain('<form method="POST" action="/auth/confirm">');
    expect(html).toContain('name="token_hash"');
    expect(html).toContain('name="type"');
    expect(html).toContain('name="next"');
    expect(html).not.toContain('name="confirm"');
    expect(html).toContain("/panel");
  });

  it("escapa los valores ocultos y descarta un destino externo", () => {
    const html = buildAuthConfirmationPage({
      tokenHash: '<script>alert("x")</script>',
      type: 'email" onfocus="alert(1)',
      next: "https://example.com",
    });

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain('name="next" value="/"');
  });
});
