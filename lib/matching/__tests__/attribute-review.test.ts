import { describe, it, expect } from "vitest";
import {
  attributeReview,
  nameSimilarity,
  mentionsCommercial,
  TEMPORAL_WINDOW_HOURS,
  AUTO_THRESHOLD,
  PENDING_THRESHOLD,
  type ShareLinkCandidate,
  type ReviewInput,
  type CommercialInfo,
} from "../attribute-review";

const REVIEW_AT = "2026-05-20T12:00:00Z";

function candidate(p: Partial<ShareLinkCandidate>): ShareLinkCandidate {
  return {
    id: p.id ?? "share-1",
    sales_id: p.sales_id ?? "sales-1",
    client_id: p.client_id ?? "client-1",
    client_full_name: p.client_full_name ?? "Cliente Genérico",
    opened_at: p.opened_at ?? "2026-05-20T10:00:00Z", // 2h antes
    sales_full_name: p.sales_full_name,
  };
}

function review(p: Partial<ReviewInput>): ReviewInput {
  return {
    google_review_id: p.google_review_id ?? "g-1",
    author_name: p.author_name ?? "Cliente Genérico",
    hasAuthorName: p.hasAuthorName,
    text: p.text,
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

  it("nombre distinto + varios comerciales en ventana → unmatched (ambiguo)", () => {
    // Sin parecido de nombre y con clics de >1 comercial, no se puede atribuir
    // ni por nombre ni por proximidad temporal (esta última es ambigua).
    const r = attributeReview(
      review({ author_name: "Persona Random" }),
      [
        candidate({ id: "a", client_full_name: "Antonio Ramírez" }),
        candidate({ id: "b", sales_id: "sales-2", client_full_name: "Otro Cliente" }),
      ],
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

describe("mentionsCommercial", () => {
  it("casa el nombre de pila como palabra completa", () => {
    expect(mentionsCommercial("Tono es muy buen comercial", "Tono Sánchez Abadía")).toBe(true);
  });

  it("casa cualquier apellido", () => {
    expect(mentionsCommercial("Genial el trato de Abadía", "Tono Sánchez Abadía")).toBe(true);
    expect(mentionsCommercial("gracias Sanchez", "Tono Sánchez Abadía")).toBe(true);
  });

  it("ignora acentos y mayúsculas", () => {
    expect(mentionsCommercial("TONO un crack", "tóno pérez")).toBe(true);
  });

  it("no casa como substring dentro de otra palabra", () => {
    expect(mentionsCommercial("un sonido monótono", "Tono Pérez")).toBe(false);
  });

  it("ignora tokens cortos del nombre (< 3 letras)", () => {
    // "Jo" es < 3 letras → no debe disparar por aparecer en el texto.
    expect(mentionsCommercial("yo no fui", "Jo Li")).toBe(false);
  });

  it("texto o nombre vacío/null → false", () => {
    expect(mentionsCommercial(null, "Tono Pérez")).toBe(false);
    expect(mentionsCommercial("Tono Pérez", null)).toBe(false);
    expect(mentionsCommercial("", "Tono Pérez")).toBe(false);
  });
});

describe("attributeReview — atribución por mención del comercial", () => {
  // Caso real: cliente "Marta Ferrer" deja reseña como "Maf" (sin parecido de
  // nombre) pero el texto menciona a "Tono", que tiene enlace en ventana.
  // Decisión 2026-06-02: la mención inequívoca cuenta en automático (counted).
  it("Tier 1: nombre no casa pero el texto menciona al comercial con enlace en ventana → counted", () => {
    const r = attributeReview(
      review({ author_name: "Maf", text: "Tono es muy buen comercial y simpático." }),
      [
        candidate({
          sales_id: "tono",
          client_id: "marta",
          client_full_name: "Marta Ferrer",
          sales_full_name: "Tono Sánchez Abadía",
        }),
      ],
    );
    expect(r.match_state).toBe("counted");
    expect(r.match_confidence).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
    expect(r.sales_id).toBe("tono");
    expect(r.client_id).toBe("marta");
    expect(r.match_evidence.reason).toBe("counted_by_commercial_mention_in_window");
  });

  // Caso de la captura (2026-06-02): cliente "MARTA VALLAS", autor "Marta
  // Palenciano Cerro" (solo coincide el nombre de pila → name_score 55 →
  // pending por nombre), pero el texto menciona a "Jefferson", dueño del
  // enlace en ventana. La mención eleva el pending a counted.
  it("eleva un pending por nombre débil a counted cuando el texto menciona al comercial", () => {
    const r = attributeReview(
      review({
        author_name: "Marta Palenciano Cerro",
        text: "Trato impecable. El trato y atención que he recibido merecen una mención especial, concretamente para Jefferson.",
      }),
      [
        candidate({
          sales_id: "jefferson",
          client_id: "marta-vallas",
          client_full_name: "Marta Vallas",
          sales_full_name: "Jefferson Javier Piguave Garcia",
        }),
      ],
    );
    expect(r.match_state).toBe("counted");
    expect(r.sales_id).toBe("jefferson");
    expect(r.client_id).toBe("marta-vallas");
    expect(r.match_evidence.reason).toBe("counted_by_commercial_mention_in_window");
  });

  it("Tier 1: elige el cliente con mejor parecido entre varios enlaces del MISMO comercial", () => {
    // Autor "María Ferrer": comparte apellido con "Marta Ferrer" (score 30,
    // por debajo del umbral del matcher normal → unmatched → entra la mención)
    // y nada con "Pedro Pérez" (0). Debe quedarse con Marta y contar.
    const r = attributeReview(
      review({ author_name: "María Ferrer", text: "Gracias Tono!" }),
      [
        candidate({
          id: "s-a",
          sales_id: "tono",
          client_id: "otro",
          client_full_name: "Pedro Pérez",
          sales_full_name: "Tono Sánchez",
        }),
        candidate({
          id: "s-b",
          sales_id: "tono",
          client_id: "marta",
          client_full_name: "Marta Ferrer",
          sales_full_name: "Tono Sánchez",
        }),
      ],
    );
    expect(r.match_state).toBe("counted");
    expect(r.client_id).toBe("marta");
    expect(r.share_link_id).toBe("s-b");
  });

  it("ambiguo: el texto menciona a DOS comerciales con enlace en ventana → unmatched (guardrail)", () => {
    const r = attributeReview(
      review({ author_name: "Random", text: "Gracias Tono y también Luis" }),
      [
        candidate({ id: "a", sales_id: "tono", sales_full_name: "Tono Sánchez", client_full_name: "X" }),
        candidate({ id: "b", sales_id: "luis", sales_full_name: "Luis Gómez", client_full_name: "Y" }),
      ],
    );
    expect(r.match_state).toBe("unmatched");
  });

  it("Tier 2: comercial mencionado SIN enlace en ventana pero en el roster → counted sin cliente", () => {
    const roster: CommercialInfo[] = [
      { sales_id: "tono", full_name: "Tono Sánchez Abadía" },
      { sales_id: "luis", full_name: "Luis Gómez" },
    ];
    const r = attributeReview(
      review({ author_name: "Maf", text: "Tono me atendió genial" }),
      [], // sin enlaces en ventana
      roster,
    );
    expect(r.match_state).toBe("counted");
    expect(r.sales_id).toBe("tono");
    expect(r.client_id).toBeUndefined();
    expect(r.match_evidence.reason).toBe("counted_by_commercial_mention_no_window");
  });

  it("Tier 2 ambiguo: dos comerciales del roster mencionados → unmatched", () => {
    const roster: CommercialInfo[] = [
      { sales_id: "tono", full_name: "Tono Sánchez" },
      { sales_id: "luis", full_name: "Luis Gómez" },
    ];
    const r = attributeReview(
      review({ author_name: "Maf", text: "Gracias Tono y Luis" }),
      [],
      roster,
    );
    expect(r.match_state).toBe("unmatched");
  });

  it("no rescata por mención si la reseña no tiene texto", () => {
    // Dos comerciales distintos en ventana → la atribución temporal a un único
    // comercial tampoco aplica (ambiguo), así aislamos el caso de la mención.
    const r = attributeReview(
      review({ author_name: "Maf" }),
      [
        candidate({ id: "a", sales_id: "tono", sales_full_name: "Tono Sánchez", client_full_name: "Marta Ferrer" }),
        candidate({ id: "b", sales_id: "luis", sales_full_name: "Luis Gómez", client_full_name: "Otro" }),
      ],
      [
        { sales_id: "tono", full_name: "Tono Sánchez" },
        { sales_id: "luis", full_name: "Luis Gómez" },
      ],
    );
    expect(r.match_state).toBe("unmatched");
  });

  it("un match por nombre fuerte NO se ve afectado por el rescate (sigue counted)", () => {
    const r = attributeReview(
      review({ author_name: "Marta Ferrer", text: "Tono es un crack" }),
      [
        candidate({
          sales_id: "tono",
          client_id: "marta",
          client_full_name: "Marta Ferrer",
          sales_full_name: "Tono Sánchez",
        }),
      ],
    );
    expect(r.match_state).toBe("counted");
  });

  it("mención sin enlace en ventana y sin roster → unmatched", () => {
    const r = attributeReview(
      review({ author_name: "Maf", text: "Tono genial" }),
      [],
    );
    expect(r.match_state).toBe("unmatched");
  });
});

describe("attributeReview — atribución temporal a un único comercial", () => {
  // Caso real (Cornel, 2026-06): un cliente abre el enlace PERSONAL del comercial
  // (sin cliente concreto → client_id null) y reseña segundos después, pero el
  // nombre del autor no casa con ningún cliente y no hay texto. La identidad del
  // comercial es inequívoca (es su enlace) → se atribuye en automático.
  it("un único comercial con clic en ventana corta, sin nombre ni mención → counted al comercial", () => {
    const opened = new Date(new Date(REVIEW_AT).getTime() - 12_000).toISOString(); // 12s antes
    const r = attributeReview(
      review({ author_name: "Eduuu Bermejo" }), // no casa con "Cliente Genérico"
      [candidate({ sales_id: "cornel", opened_at: opened })],
    );
    expect(r.match_state).toBe("counted");
    expect(r.match_confidence).toBe(70);
    expect(r.sales_id).toBe("cornel");
    expect(r.client_id).toBeUndefined();
    expect(r.match_evidence.reason).toBe("counted_by_single_commercial_temporal");
  });

  it("dos comerciales con clic en ventana, sin nombre ni mención → unmatched (ambiguo)", () => {
    const r = attributeReview(
      review({ author_name: "Eduuu Bermejo" }),
      [
        candidate({ id: "a", sales_id: "cornel" }),
        candidate({ id: "b", sales_id: "fidanka" }),
      ],
    );
    expect(r.match_state).toBe("unmatched");
  });

  it("único comercial pero el clic fue >12h antes → unmatched (fuera de ventana corta)", () => {
    const opened = new Date(
      new Date(REVIEW_AT).getTime() - 13 * 3_600_000,
    ).toISOString();
    const r = attributeReview(
      review({ author_name: "Eduuu Bermejo" }),
      [candidate({ sales_id: "cornel", opened_at: opened })],
    );
    expect(r.match_state).toBe("unmatched");
  });

  it("único comercial con nombre que SÍ casa → counted por nombre (no por el path temporal)", () => {
    const r = attributeReview(
      review({ author_name: "Cliente Genérico" }),
      [candidate({ sales_id: "cornel", client_full_name: "Cliente Genérico" })],
    );
    expect(r.match_state).toBe("counted");
    expect(r.match_confidence).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
    expect(r.client_id).toBe("client-1");
    expect(r.match_evidence.reason).not.toBe("counted_by_single_commercial_temporal");
  });

  it("anónimo con dos clics del mismo comercial → unmatched (el path temporal no aplica a anónimos)", () => {
    const r = attributeReview(
      review({ author_name: "Anónimo", hasAuthorName: false }),
      [
        candidate({ id: "a", sales_id: "cornel" }),
        candidate({ id: "b", sales_id: "cornel" }),
      ],
    );
    expect(r.match_state).toBe("unmatched");
    expect(r.match_evidence.reason).toBe("anonymous_author_multiple_candidates (2)");
  });

  it("escenario real Eduuu Bermejo: 5 clics de Cornel, el más cercano 12s antes → counted a Cornel", () => {
    const t = new Date(REVIEW_AT).getTime();
    const clics = [
      { id: "c1", opened_at: new Date(t - 12_000).toISOString() }, //  12s
      { id: "c2", opened_at: new Date(t - 2 * 3_600_000).toISOString() }, //  2h
      { id: "c3", opened_at: new Date(t - 5 * 3_600_000).toISOString() }, //  5h
      { id: "c4", opened_at: new Date(t - 8 * 3_600_000).toISOString() }, //  8h
      { id: "c5", opened_at: new Date(t - 11 * 3_600_000).toISOString() }, // 11h
    ];
    const r = attributeReview(
      review({ author_name: "Eduuu Bermejo" }),
      clics.map((c) => candidate({ ...c, sales_id: "cornel" })),
    );
    expect(r.match_state).toBe("counted");
    expect(r.sales_id).toBe("cornel");
    expect(r.client_id).toBeUndefined();
    expect(r.share_link_id).toBe("c1"); // el clic más cercano
  });
});
