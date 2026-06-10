-- 025 · El reviews_manager puede ESCRIBIR sobre reviews (paridad con admin)
--
-- BUG (detectado en prod 2026-06-10): un reviews_manager que reasigna una
-- reseña a un comercial desde /resenas/verificacion no guarda nada — el
-- cambio "se pierde" en silencio.
--
-- Causa raíz: el rol reviews_manager NUNCA tuvo policy de UPDATE sobre
-- public.reviews. Desde mig 002 solo tiene `reviews_manager_select` (SELECT).
-- La policy `reviews_admin_all` es `using (current_role() = 'admin')`, que
-- NO incluye al gestor. La mig 016 dejó el comentario "reviews_manager y
-- admin no cambian" asumiendo una paridad RLS que en realidad nunca existió.
--
-- Como las server actions de verificación y de respuestas hacen el UPDATE
-- con cookie-client y no comprueban filas afectadas, la RLS bloqueaba el
-- UPDATE devolviendo 0 filas con error=null → la acción reportaba ok:true
-- sin persistir nada. Acciones afectadas para el gestor:
--   • Verificación: reassignReview, confirmReview, rejectReview,
--     markReviewRemoved, restoreReview (app/(profile)/resenas/verificacion).
--   • Respuestas (mig 024): saveReviewReply, clearReviewReply
--     (app/(profile)/resenas/respuestas).
--
-- Fix: dar al reviews_manager escritura completa sobre reviews, paridad real
-- con admin (intento documentado en CLAUDE.md §4.24 y §4.48). Mantiene la
-- defensa en profundidad por RLS (§6) en lugar de degradar a service-client.
-- El gating en código (canPerformAction / canReplyToReviews) sigue siendo la
-- primera capa; esta policy es la segunda.
--
-- Idempotente.

drop policy if exists reviews_manager_all on public.reviews;
create policy reviews_manager_all on public.reviews
  for all
  to authenticated
  using (public.current_role() = 'reviews_manager')
  with check (public.current_role() = 'reviews_manager');

-- Nota: la policy SELECT previa `reviews_manager_select` (mig 002) queda
-- redundante con el USING de esta (las policies se evalúan en OR), pero se
-- deja por claridad histórica y para no romper nada. Una `for all` cubre
-- SELECT/INSERT/UPDATE/DELETE; en la práctica el gestor solo hace SELECT y
-- UPDATE desde la app.
