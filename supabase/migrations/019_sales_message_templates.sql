-- Plantillas de mensaje personalizadas por comercial.
--
-- Hoy el comercial comparte el enlace de un cliente con UNA plantilla fija
-- (lib/messaging.ts). A partir de aquí ofrecemos 3 plantillas base
-- (recién atendido / reavivar visita / breve) y dejamos que cada comercial
-- reescriba cualquiera de ellas "a su forma de hablar" desde /panel/plantillas.
--
-- Esas versiones personalizadas se guardan aquí como JSONB keyed por id de
-- plantilla, p.ej.:
--   { "post_visita": "<texto con {nombre_cliente}/{nombre_comercial}/{url}>",
--     "reavivar": "...", "breve": "..." }
-- Claves ausentes o en blanco → se usa la plantilla base de código.
--
-- Sin política RLS nueva: la escritura es server-only vía service-client
-- filtrando por id = auth.uid() (mismo patrón que el avatar en
-- (profile)/perfil/actions.ts). NULL = el comercial nunca personalizó.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS message_templates jsonb;
