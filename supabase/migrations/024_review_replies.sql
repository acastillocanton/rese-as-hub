-- ReseñaHub — migration 024
-- Respuestas del propietario a las reseñas de Google, desde la plataforma.
--
-- Flujo HÍBRIDO (ver CLAUDE.md §4.48):
--   • HOY (Places API + cuota Business Profile a 0): flujo ASISTIDO. El gestor
--     redacta la respuesta en /resenas/respuestas, la marca como respondida
--     (reply_via='manual'), copia el texto y lo pega en Google manualmente.
--     Estas columnas guardan ese estado para poder distinguir respondidas de
--     pendientes y mostrar una bandeja de trabajo.
--   • FUTURO (cuota Business Profile concedida, §4.26 Bloque G): publicación
--     directa por API (reply_via='api') + auto-detección de respuestas puestas
--     directamente en Google vía el campo reviewReply del cron BP
--     (reply_via='google_detected', reply_synced_at = reviewReply.updateTime).
--
-- Sin RLS nueva: admin y reviews_manager ya tienen UPDATE amplio sobre reviews
-- (mig 002/005/016). El gating "solo admin+manager pueden responder" se hace
-- en código (lib/auth/reply-gating.ts), igual que markReviewRemoved.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Reversible: drop de las 5 columnas + drop del índice.

-- 1. Texto de la respuesta (UTF-8 → emojis sin tratamiento especial).
alter table public.reviews
  add column if not exists reply_text text;

-- 2. Marca "respondida". NULL = pendiente. Pivota toda la UI y los contadores.
alter table public.reviews
  add column if not exists replied_at timestamptz;

-- 3. Quién respondió (gestor o admin). FK con SET NULL para no perder la
--    reseña si se borra el perfil.
alter table public.reviews
  add column if not exists reply_by uuid references public.profiles(id) on delete set null;

-- 4. Vía de la respuesta. Hoy siempre 'manual'. CHECK en vez de enum nuevo
--    para evitar una segunda migración de ALTER TYPE (mismo pragmatismo que
--    otras columnas text del esquema).
alter table public.reviews
  add column if not exists reply_via text
    check (reply_via is null or reply_via in ('manual', 'api', 'google_detected'));

-- 5. (Fase API) updateTime del reviewReply de Google la última vez que el cron
--    BP lo reconcilió. Permite distinguir "respondida en nuestra app" de
--    "confirmada en Google".
alter table public.reviews
  add column if not exists reply_synced_at timestamptz;

-- 6. Índice parcial para el contador "Sin responder (N)" y la cola de
--    pendientes: solo las vivas sin respuesta. (location_id, google_created_at)
--    sirve también para filtrar por ficha y ordenar la cola (antiguas primero).
create index if not exists reviews_pending_reply_idx
  on public.reviews(location_id, google_created_at)
  where replied_at is null and removed_at is null;
