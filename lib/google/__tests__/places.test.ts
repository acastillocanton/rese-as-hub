import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidPlaceId,
  extractReviewId,
  mapPlacesReview,
  listPlaceReviews,
  PlacesApiError,
} from "../places";

describe("isValidPlaceId", () => {
  it("acepta IDs típicos de Google Places", () => {
    expect(isValidPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(true);
    expect(isValidPlaceId("ChIJgUbEo8cfqokR5lP9_Wh_DaM")).toBe(true);
  });

  it("rechaza cadenas demasiado cortas o largas", () => {
    expect(isValidPlaceId("short")).toBe(false);
    expect(isValidPlaceId("a".repeat(300))).toBe(false);
  });

  it("rechaza caracteres no permitidos", () => {
    expect(isValidPlaceId("ChIJ has spaces 0123")).toBe(false);
    expect(isValidPlaceId("ChIJ;DROP TABLE--")).toBe(false);
  });
});

describe("extractReviewId", () => {
  it("extrae el último segmento del name", () => {
    expect(
      extractReviewId("places/ChIJN1t_tDeuEmsRUsoyG83frY4/reviews/AbcDef123"),
    ).toBe("AbcDef123");
  });

  it("devuelve el name tal cual si no contiene barras", () => {
    expect(extractReviewId("raw_id")).toBe("raw_id");
  });

  it("devuelve el name tal cual si termina en barra", () => {
    expect(extractReviewId("places/X/reviews/")).toBe("places/X/reviews/");
  });
});

describe("mapPlacesReview", () => {
  it("normaliza una reseña típica con todos los campos", () => {
    const mapped = mapPlacesReview({
      name: "places/ChIJ-abc/reviews/AbcDef123",
      rating: 5,
      text: { text: "Buen servicio", languageCode: "es" },
      authorAttribution: { displayName: "Antonio Ramírez" },
      publishTime: "2026-05-01T10:00:00Z",
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.google_review_id).toBe("places:AbcDef123");
    expect(mapped!.author_name).toBe("Antonio Ramírez");
    expect(mapped!.hasAuthorName).toBe(true);
    expect(mapped!.rating).toBe(5);
    expect(mapped!.text).toBe("Buen servicio");
    expect(mapped!.google_created_at).toBe("2026-05-01T10:00:00Z");
  });

  it("marca hasAuthorName=false cuando el autor es 'Un usuario de Google'", () => {
    const mapped = mapPlacesReview({
      name: "places/X/reviews/Y",
      rating: 4,
      authorAttribution: { displayName: "Un usuario de Google" },
      publishTime: "2026-05-01T10:00:00Z",
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.hasAuthorName).toBe(false);
    expect(mapped!.author_name).toBe("Anónimo");
  });

  it("marca hasAuthorName=false si falta displayName", () => {
    const mapped = mapPlacesReview({
      name: "places/X/reviews/Y",
      rating: 3,
      publishTime: "2026-05-01T10:00:00Z",
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.hasAuthorName).toBe(false);
  });

  it("usa originalText cuando text está vacío", () => {
    const mapped = mapPlacesReview({
      name: "places/X/reviews/Y",
      rating: 5,
      text: { text: "" },
      originalText: { text: "Texto original", languageCode: "es" },
      authorAttribution: { displayName: "Antonio" },
      publishTime: "2026-05-01T10:00:00Z",
    });
    expect(mapped!.text).toBe("Texto original");
  });

  it("devuelve text=null cuando ambos están vacíos", () => {
    const mapped = mapPlacesReview({
      name: "places/X/reviews/Y",
      rating: 5,
      text: { text: "" },
      originalText: { text: "" },
      authorAttribution: { displayName: "Antonio" },
      publishTime: "2026-05-01T10:00:00Z",
    });
    expect(mapped!.text).toBeNull();
  });

  it("redondea ratings decimales (Places puede devolver 4.0)", () => {
    const mapped = mapPlacesReview({
      name: "places/X/reviews/Y",
      rating: 4.0,
      authorAttribution: { displayName: "Antonio" },
      publishTime: "2026-05-01T10:00:00Z",
    });
    expect(mapped!.rating).toBe(4);
  });

  it("devuelve null si falta name o publishTime", () => {
    expect(
      mapPlacesReview({
        rating: 5,
        publishTime: "2026-05-01T10:00:00Z",
      }),
    ).toBeNull();
    expect(
      mapPlacesReview({
        name: "places/X/reviews/Y",
        rating: 5,
      }),
    ).toBeNull();
  });

  it("devuelve null si rating está fuera de 1-5", () => {
    expect(
      mapPlacesReview({
        name: "places/X/reviews/Y",
        rating: 0,
        publishTime: "2026-05-01T10:00:00Z",
      }),
    ).toBeNull();
    expect(
      mapPlacesReview({
        name: "places/X/reviews/Y",
        rating: 6,
        publishTime: "2026-05-01T10:00:00Z",
      }),
    ).toBeNull();
  });
});

describe("listPlaceReviews — integración con fetch", () => {
  const VALID_PLACE = "ChIJN1t_tDeuEmsRUsoyG83frY4";
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GOOGLE_PLACES_API_KEY;
    } else {
      process.env.GOOGLE_PLACES_API_KEY = originalKey;
    }
    vi.restoreAllMocks();
  });

  it("mapea respuesta exitosa", async () => {
    const mockResponse = {
      id: VALID_PLACE,
      reviews: [
        {
          name: `places/${VALID_PLACE}/reviews/RVW_1`,
          rating: 5,
          text: { text: "Excelente" },
          authorAttribution: { displayName: "María" },
          publishTime: "2026-05-01T10:00:00Z",
        },
        {
          name: `places/${VALID_PLACE}/reviews/RVW_2`,
          rating: 3,
          authorAttribution: { displayName: "Un usuario de Google" },
          publishTime: "2026-05-02T10:00:00Z",
        },
      ],
    };

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const out = await listPlaceReviews(VALID_PLACE);
    expect(out).toHaveLength(2);
    expect(out[0]!.google_review_id).toBe("places:RVW_1");
    expect(out[0]!.author_name).toBe("María");
    expect(out[1]!.hasAuthorName).toBe(false);
  });

  it("devuelve [] cuando Places no incluye reviews", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: VALID_PLACE }), { status: 200 }),
    );
    const out = await listPlaceReviews(VALID_PLACE);
    expect(out).toEqual([]);
  });

  it("lanza PlacesApiError si Google rechaza", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 403, message: "API key not valid.", status: "PERMISSION_DENIED" },
        }),
        { status: 403 },
      ),
    );
    await expect(listPlaceReviews(VALID_PLACE)).rejects.toBeInstanceOf(PlacesApiError);
  });

  it("rechaza Place ID inválido sin pegar a la red", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await expect(listPlaceReviews("bad id")).rejects.toBeInstanceOf(PlacesApiError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lanza PlacesApiError si falta GOOGLE_PLACES_API_KEY", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    await expect(listPlaceReviews(VALID_PLACE)).rejects.toBeInstanceOf(PlacesApiError);
  });

  it("añade header X-Goog-Api-Key", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ reviews: [] }), { status: 200 }),
    );
    await listPlaceReviews(VALID_PLACE);
    const call = fetchSpy.mock.calls[0]!;
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
  });
});
