-- 029 · Enlace directo a cada reseña en Google Maps (§4.54)
--
-- Contexto: hasta ahora los listados solo enlazaban a la LISTA de reseñas de
-- la ficha (buildGoogleReviewListUrl). El deep-link a la reseña concreta no lo
-- expone ninguna API oficial de Google (ni Business Profile ni Places dan URL
-- por reseña), pero el enlace de "Compartir reseña" de Maps sí existe
-- (`/maps/reviews/data=…`). Lo obtenemos automáticamente por un enriquecimiento
-- aparte (lib/google/maps-ugc.ts + cron dedicado) y lo guardamos aquí.
--
-- Por qué la URL completa y no solo un token: el formato del deep-link tiene
-- partes opacas; guardar la URL final hace el dato autocontenido y a prueba de
-- cambios de plantilla.
--
-- google_fid (en locations): el feed interno de Maps se indexa por el Feature
-- ID hex (`0x…:0x…`), distinto del place_id (`ChIJ…`). Se resuelve una vez por
-- ficha y se cachea aquí.
--
-- Sin RLS nueva: solo el enriquecimiento (service-client) escribe estas
-- columnas. La lectura va con las policies de SELECT ya existentes de reviews.

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS google_fid text;            -- "0x...:0x..." cacheado

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS google_maps_url text,       -- deep-link a la reseña concreta
  ADD COLUMN IF NOT EXISTS maps_url_matched_at timestamptz;

-- Cola del enriquecimiento: reseñas vivas aún sin deep-link. Índice parcial
-- pequeño (la mayoría tendrá URL una vez procesadas) que hace barato el
-- backfill incremental de cada run.
CREATE INDEX IF NOT EXISTS reviews_maps_url_pending_idx
  ON reviews (location_id)
  WHERE google_maps_url IS NULL AND removed_at IS NULL;

COMMENT ON COLUMN reviews.google_maps_url IS
  'Deep-link público a la reseña concreta en Google Maps (/maps/reviews/data=…), §4.54. NULL = aún sin enriquecer → la UI cae al enlace de la lista de la ficha.';
COMMENT ON COLUMN locations.google_fid IS
  'Feature ID hex de Google Maps (0x…:0x…), distinto del place_id. Cacheado para el feed interno de reseñas (§4.54).';
