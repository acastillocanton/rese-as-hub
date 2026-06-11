-- 028 · Soft-delete automático de reseñas borradas en Google (capa missing_since)
--
-- Reactiva la detección automática de §4.20, desactivada en la era Places por
-- falsos positivos (la API legacy devolvía sets inconsistentes entre llamadas).
-- Con Business Profile como fuente única (§4.50) el listado es autoritativo y
-- ordenado por updateTime desc, lo que da un invariante de ventana: el fetch
-- contiene TODAS las reseñas con updateTime >= min(updateTime bajado). Si una
-- fila BP de BD con google_created_at > ese mínimo NO aparece, ha desaparecido
-- de Google (borrada por el autor / retirada por Google / perfil eliminado).
--
-- Capa anti-falsos-positivos (la lección de Places): la primera ausencia NO
-- marca nada — sella missing_since. Solo si la reseña sigue ausente pasado el
-- umbral (24h ≈ varios runs del cron horario) se pone removed_at (soft-delete,
-- §4.20: sale de listados y KPIs pero se conserva). Si reaparece en una
-- ventana posterior, missing_since se limpia y no pasa nada.
--
-- Semántica:
--   • NULL  = la reseña se ve con normalidad en Google (caso normal).
--   • fecha = ausente de la ventana de fetch desde ese momento; pendiente de
--             confirmar (si supera el umbral → removed_at, dejando
--             missing_since como traza de cuándo desapareció).
--
-- Solo la escribe el cron BP via service-client (reconcileRemovedBp en
-- lib/google/sync-business-profile.ts). Sin cambios de RLS. La restauración
-- manual (restoreReview) limpia también missing_since para dar un periodo de
-- gracia fresco y no re-marcar al run siguiente.

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS missing_since timestamptz;

COMMENT ON COLUMN reviews.missing_since IS
  'Primera ausencia de la reseña en la ventana de fetch del cron BP (§4.20). NULL = visible en Google. Si supera el umbral (24h) el cron pone removed_at.';
