import { describe, it, expect } from "vitest";
import {
  attributeReview,
  nameSimilarity,
  TEMPORAL_WINDOW_HOURS,
  AUTO_THRESHOLD,
  PENDING_THRESHOLD,
  type ShareLinkCandidate,
  type ReviewInput,
} from "../attribute-review";

const REVIEW_AT = "2026-05-20T12:00:00Z";

function candidate(p: Partial<ShareLinkCandidate>): ShareLinkCandidate {
  return {
    id: p.id ?? "share-1",
    sales_id: p.sales_id ?? "sales-1",
    client_id: p.client_id ?? "client-1",
    client_full_name: p.client_full_name ?? "Cliente Genérico",
    opened_at: p.opened_at ?? "2026-05-20T10:00:00Z", // 2h antes
  };
}

function review(p: Partial<ReviewInput>): ReviewInput {
  return {
    google_review_id: p.google_review_id ?? "g-1",
    author_name: p.author_name ?? "Cliente Genérico",
    hasAuthorName: p.hasAuthorName,
    google_created_at: p.google_created_at ?? REVIEW_AT,
  };
}

describe("nameSimilarity", () => {
  it("exact match → 100", () => {
    expect(nameSimilarity("Antonio Ramírez", "Antonio Ramírez")).toBe(100);
  });

  it("exact match con acentos / casing distinto → 100", () => {
    expect(nameSimilarity("ANTONIO RAMÍREZ", "antonio ramirez")).toBe(100);
  });

  it("todos los tokens del cliente en autor (autor más largo) → 90", () => {
    expect(nameSimilarity("Antonio Ramírez", "Antonio Ramírez Pérez")).toBe(90);
  });

  it("primer nombre + apellido completo coinciden → 88", () => {
    expect(nameSimilarity("Antonio Ramírez Pérez", "Antonio Ramírez")).toBe(88);
  });

  it("primer nombre + inicial del apellido → 72", () => {
    expect(nameSimilarity("Antonio Ramírez", "Antonio R")).toBe(72);
    expect(nameSimilarity("Antonio R", "Antonio Ramírez")).toBe(72);
  });

  it("solo primer nombre coincide, segundo distinto → 55", () => {
    expect(nameSimilarity("Antonio Ramírez", "Antonio López")).toBe(55);
  });

  it("solo primer nombre, autor sin más → 55", () => {
    expect(nameSimilarity("Antonio Ramírez", "Antonio")).toBe(55);
  });

  it("solo apellido coincide (no primer nombre) → 30", () => {
    expect(nameSimilarity("Antonio Ramírez", "Luis Ramírez")).toBe(30);
  });

  it("ninguna coincidencia → 0", () => {
    expect(nameSimilarity("Antonio Ramírez", "Luis López")).toBe(0);
  });

  it("string vacío → 0", () => {
    expect(nameSimilarity("", "Antonio Ramírez")).toBe(0);
    expect(nameSimilarity("Antonio Ramírez", "")).toBe(0);
  });
});

describe("attributeReview — flujo con autor real", () => {
  it("sin candidatos en ventana → unmatched", () => {
    const r = attributeReview(review({}), []);
    expect(r.match_state).toBe("unmatched");
    expect(r.match_confidence).toBe(0);
    expect(r.match_evidence.reason).toBe("no_share_links_in_window");
  });

  it("candidato con nombre exacto + ventana corta → counted con bonus", () => {
    const r = attributeReview(
      review({ author_name: "Cliente Genérico" }),
      [candidate({ client_full_name: "Cliente Genérico" })],
    );
    expect(r.match_state).toBe("counted");
    expect(r.match_confidence).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
    expect(r.sales_id).toBe("sales-1");
    expect(r.share_link_id).toBe("share-1");
  });

  it("candidato con nombre parcial (solo primer nombre) → pending", () => {
    const r = attributeReview(
      review({ author_name: "Antonio López" }),
      [candidate({ client_full_name: "Antonio Ramírez" })],
    );
    // 55 (solo first match) + 8 (bonus temporal corto) = 63 → pending
    expect(r.match_state).toBe("pending");
    expect(r.match_confidence).toBeGreaterThanOrEqual(PENDING_THRESHOLD);
    expect(r.match_confidence).toBeLessThan(AUTO_THRESHOLD);
  });

  it("nombre completamente distinto → unmatched", () => {
    const r = attributeReview(
      review({ author_name: "Persona Random" }),
      [candidate({ client_full_name: "Antonio Ramírez" })],
    );
    expect(r.match_state).toBe("unmatched");
  });

  it("candidato fuera de la ventana temporal → unmatched", () => {
    const longAgo = new Date(
      new Date(REVIEW_AT).getTime() - (TEMPORAL_WINDOW_HOURS + 5) * 3_600_000,
    ).toISOString();
    const r = attributeReview(review({}), [candidate({ opened_at: longAgo })]);
    expect(r.match_state).toBe("unmatched");
    expect(r.match_evidence.reason).toBe("no_share_links_in_window");
  });

  it("candidato con opened_at POSTERIOR a la reseña se ignora", () => {
    const future = new Date(
      new Date(REVIEW_AT).getTime() + 3_600_000,
    ).toISOString();
    const r = attributeReview(review({}), [candidate({ opened_at: future })]);
    expect(r.match_state).toBe("unmatched");
  });

  it("entre múltiples candidatos, gana el de mejor score", () => {
    const r = attributeReview(
      review({ author_name: "Antonio Ramírez" }),
      [
        candidate({ id: "s-bad", client_full_name: "Pedro Pérez" }),
        candidate({ id: "s-good", client_full_name: "Antonio Ramírez" }),
      ],
    );
    expect(r.match_state).toBe("counted");
    expect(r.share_link_id).toBe("s-good");
  });

  it("ventana >24h penaliza el score", () => {
    const old = new Date(
      new Date(REVIEW_AT).getTime() - 30 * 3_600_000,
    ).toISOString();
    const r = attributeReview(
      review({ author_name: "Cliente Genérico" }),
      [candidate({ client_full_name: "Cliente Genérico", opened_at: old })],
    );
    // 100 (exact name) - 10 (penalización temporal) = 90 → counted
    expect(r.match_state).toBe("counted");
    expect(r.match_confidence).toBeLessThan(100);
  });
});

describe("attributeReview — modo anonymous (autor sin nombre)", () => {
  it("UN candidato cercano (≤4h) → pending con 50% confianza", () => {
    const r = attributeReview(
      review({ author_name: "Anónimo", hasAuthorName: false }),
      [candidate({})],
    );
    expect(r.match_state).toBe("pending");
    expect(r.match_confidence).toBe(50);
    expect(r.sales_id).toBe("sales-1");
    expect(r.match_evidence.reason).toBe("anonymous_author_single_temporal_match");
  });

  it("CERO candidatos cercanos → unmatched", () => {
    const r = attributeReview(
      review({ author_name: "Anónimo", hasAuthorName: false }),
      [],
    );
    expect(r.match_state).toBe("unmatched");
    expect(r.match_evidence.reason).toBe("anonymous_author_no_nearby_candidates");
  });

  it("VARIOS candidatos cercanos → unmatched (no podemos elegir sin nombre)", () => {
    const r = attributeReview(
      review({ author_name: "Anónimo", hasAuthorName: false }),
      [
        candidate({ id: "a" }),
        candidate({ id: "b", sales_id: "sales-2" }),
      ],
    );
    expect(r.match_state).toBe("unmatched");
    expect(r.match_evidence.reason).toBe(
      "anonymous_author_multiple_candidates (2)",
    );
  });

  it("candidato a >4h NO cuenta como nearby en modo anonymous", () => {
    const far = new Date(
      new Date(REVIEW_AT).getTime() - 10 * 3_600_000,
    ).toISOString();
    const r = attributeReview(
      review({ author_name: "Anónimo", hasAuthorName: false }),
      [candidate({ opened_at: far })],
    );
    expect(r.match_state).toBe("unmatched");
  });
});
