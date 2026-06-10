import { describe, expect, it } from "vitest";
import { normalizeOwnerReply } from "@/lib/google/owner-reply";

describe("normalizeOwnerReply", () => {
  it("devuelve null cuando no hay reviewReply (caso Places / sin respuesta)", () => {
    expect(normalizeOwnerReply(undefined)).toBeNull();
    expect(normalizeOwnerReply(null)).toBeNull();
  });

  it("normaliza comment + updateTime a { text, repliedAt } ISO", () => {
    const out = normalizeOwnerReply({
      comment: "¡Gracias por tu reseña!",
      updateTime: "2026-06-10T08:30:00Z",
    });
    expect(out).toEqual({
      text: "¡Gracias por tu reseña!",
      repliedAt: "2026-06-10T08:30:00.000Z",
    });
  });

  it("quita la traducción de Google también de la respuesta del propietario", () => {
    const out = normalizeOwnerReply({
      comment:
        "Gracias por confiar en nosotros.\n\n(Translated by Google)\nThank you for trusting us.",
      updateTime: "2026-06-10T09:00:00.000Z",
    });
    expect(out?.text).toBe("Gracias por confiar en nosotros.");
  });

  it("cae a text='' cuando la respuesta queda vacía (la reseña debe salir de la cola igual)", () => {
    const out = normalizeOwnerReply({ comment: "", updateTime: "2026-06-10T09:00:00.000Z" });
    expect(out?.text).toBe("");
    expect(out?.repliedAt).toBe("2026-06-10T09:00:00.000Z");
  });

  it("maneja comment ausente", () => {
    const out = normalizeOwnerReply({ updateTime: "2026-06-10T09:00:00.000Z" });
    expect(out).toEqual({ text: "", repliedAt: "2026-06-10T09:00:00.000Z" });
  });
});
