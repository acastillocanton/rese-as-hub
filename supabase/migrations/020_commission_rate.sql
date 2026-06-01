-- Tarifa de comisión por reseña (€) por productor (sales + office_director).
-- Se usa para mostrar el importe estimado a abonar en el periodo de comisión
-- (20→20) en el panel del comercial: € = reseñas counted × commission_rate.
--
-- Nullable y sin default: NULL = tarifa no configurada → la UI muestra "—" en €
-- y solo enseña el número de reseñas. No requiere RLS nueva: la escritura ya
-- está cubierta por las policies de UPDATE de profiles para admin/manager
-- (mig 005) y office_director sobre su equipo (mig 013).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS commission_rate numeric(8,2);
