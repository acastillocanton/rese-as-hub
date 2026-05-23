import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidPlaceId,
  synthesizeReviewId,
  mapPlacesReview,
  listPlaceReviews,
  PlacesApiError,
} from "../places";

const VALID_PLACE = "ChIJN1t_tDeuEmsRUsoyG83frY4";

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

describe("synthesizeReviewId", () => {
  it("genera ID estable y determinista para misma entrada", () => {
    const a = synthesizeReviewId("ChIJ-test", 1716480000, "Antonio Ramírez");
    const b = synthesizeReviewId("ChIJ-test", 1716480000, "Antonio Ramírez");
    expect(a).toBe(b);
    expect(a).toMatch(/^ChIJ-test_1716480000_[a-f0-9]{8}$/);
  });

  it("genera IDs distintos para autores distintos", () => {
    const a = synthesizeReviewId("ChIJ-test", 1716480000, "Antonio");
    const b = synthesizeReviewId("ChIJ-test", 1716480000, "Maria");
    expect(a).not.toBe(b);
  });

  it("genera IDs distintos para timestamps distintos", () => {
    const a = synthesizeReviewId("ChIJ-test", 1716480000, "Antonio");
    const b = synthesizeReviewId("ChIJ-test", 1716480001, "Antonio");
    expect(a).not.toBe(b);
  });
});

describe("mapPlacesReview", () => {
  it("normaliza una reseña típica con todos los campos", () => {
    const mapped = mapPlacesReview(VALID_PLACE, {
      author_name: "Antonio Ramírez",
      rating: 5,
      text: "Buen servicio",
      language: "es",
      time: 1716480000,
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.google_review_id).toMatch(
      /^places:ChIJN1t_tDeuEmsRUsoyG83frY4_1716480000_[a-f0-9]{8}$/,
    );
    expect(mapped!.author_name).toBe("Antonio Ramírez");
    expect(mapped!.hasAuthorName).toBe(true);
    expect(mapped!.rating).toBe(5);
    expect(mapped!.text).toBe("Buen servicio");
    expect(mapped!.google_created_at).toBe("2024-05-23T16:00:00.000Z");
  });

  it("marca hasAuthorName=false cuando autor es 'Un usuario de Google'", () => {
    const mapped = mapPlacesReview(VALID_PLACE, {
      author_name: "Un usuario de Google",
      rating: 4,
      time: 1716480000,
    });
    expect(mapped).not.toBeNull();
    expect(mapped!.hasAuthorName).toBe(false);
    expect(mapped!.author_name).toBe("Anónimo");
  });

  it("ignora reseñas sin time válido", () => {
    expect(mapPlacesReview(VALID_PLACE, { author_name: "X", rating: 5 })).toBeNull();
    expect(
      mapPlacesReview(VALID_PLACE, { author_name: "X", rating: 5, time: 0 }),
    ).toBeNull();
  });

  it("ignora reseñas con rating fuera de 1-5", () => {
    expect(
      mapPlacesReview(VALID_PLACE, { author_name: "X", rating: 0, time: 100 }),
    ).toBeNull();
    expect(
      mapPlacesReview(VALID_PLACE, { author_name: "X", rating: 6, time: 100 }),
    ).toBeNull();
  });

  it("text vacío o solo whitespace → null", () => {
    const mapped = mapPlacesReview(VALID_PLACE, {
      author_name: "Antonio",
      rating: 5,
      text: "   ",
      time: 1716480000,
    });
    expect(mapped!.text).toBeNull();
  });

  it("redondea ratings decimales", () => {
    const mapped = mapPlacesReview(VALID_PLACE, {
      author_name: "Antonio",
      rating: 4.0,
      time: 1716480000,
    });
    expect(mapped!.rating).toBe(4);
  });
});

describe("listPlaceReviews — integración con fetch", () => {
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

  it("mapea respuesta exitosa OK con reseñas", async () => {
    const mockResponse = {
      status: "OK",
      result: {
        name: "Negocio Test",
        reviews: [
          {
            author_name: "María",
            rating: 5,
            text: "Excelente",
            time: 1716480000,
            language: "es",
          },
          {
            author_name: "Un usuario de Google",
            rating: 3,
            time: 1716393600,
          },
        ],
      },
    };

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const out = await listPlaceReviews(VALID_PLACE);
    expect(out).toHaveLength(2);
    expect(out[0]!.google_review_id).toMatch(/^places:/);
    expect(out[0]!.author_name).toBe("María");
    expect(out[1]!.hasAuthorName).toBe(false);
  });

  it("devuelve [] con status ZERO_RESULTS", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ZERO_RESULTS" }), { status: 200 }),
    );
    expect(await listPlaceReviews(VALID_PLACE)).toEqual([]);
  });

  it("devuelve [] con status NOT_FOUND", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "NOT_FOUND" }), { status: 200 }),
    );
    expect(await listPlaceReviews(VALID_PLACE)).toEqual([]);
  });

  it("lanza PlacesApiError con REQUEST_DENIED", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "REQUEST_DENIED",
          error_message: "API key not valid.",
        }),
        { status: 200 },
      ),
    );
    await expect(listPlaceReviews(VALID_PLACE)).rejects.toBeInstanceOf(PlacesApiError);
  });

  it("lanza PlacesApiError con OVER_QUERY_LIMIT", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "OVER_QUERY_LIMIT" }), { status: 200 }),
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

  it("llama al endpoint legacy con reviews_sort=newest", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ status: "OK", result: { reviews: [] } }),
        { status: 200 },
      ),
    );
    await listPlaceReviews(VALID_PLACE);
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("maps.googleapis.com/maps/api/place/details/json");
    expect(url).toContain("reviews_sort=newest");
    expect(url).toContain(`place_id=${VALID_PLACE}`);
    expect(url).toContain("key=test-key");
  });
});
