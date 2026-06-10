# Handoff — ReseñaHub

> Traspaso de trabajo (no de diseño). Para el handoff de integración de diseño desde Claude Design, ver [`handoff-template.md`](handoff-template.md).
>
> **Fuentes de verdad permanentes**: [`CLAUDE.md`](CLAUDE.md) (estado + workarounds) y [`spec.md`](spec.md) (producto). Este archivo resume la **última tanda de trabajo** y el estado operativo para retomar rápido. Las memorias locales (`~/.claude/projects/.../memory/`) NO viajan entre máquinas — la continuidad cross-máquina es CLAUDE.md + spec.md + este handoff.

**Última actualización**: 2026-06-10 · **Rama**: `main` · **HEAD**: docs de esta sesión (tras `af8ca49`)

---

## 1. Qué se hizo en esta sesión (2026-06-10)

Sesión grande: un bugfix de RLS, una feature de comisión, y **la activación end-to-end de Google Business Profile** (el bloqueo de meses).

### A. Bug: el `reviews_manager` no podía escribir sobre `reviews` (mig 025)
Reasignar/confirmar/rechazar/responder fallaba **en silencio** para el gestor: nunca tuvo policy de UPDATE sobre `reviews` (solo SELECT desde mig 002), y las server actions no comprobaban filas afectadas → RLS bloqueaba con 0 filas y `error=null` → devolvían `ok:true` sin guardar. Fix: **mig 025** `reviews_manager_all` (paridad real con admin). Commits `b3c4dfd`, `f265f76`. Detalle: **CLAUDE.md §7** + memoria nueva.

### B. Tope de reseñas BONIFICABLES por productor (mig 026)
Dirección cambió la política: se paga un **máximo de N reseñas por periodo de comisión** (default 5), **configurable por comercial/director**. Distinto de `monthly_goal`. El € = `min(counted, commission_cap) × commission_rate`.
- **mig 026**: `profiles.commission_cap int DEFAULT 5` (NULL = sin tope) + backfill productores a 5 + congelado en `profiles_self_update`.
- Helper puro [lib/commission.ts](lib/commission.ts) (única fuente de verdad) + `commissionCapSchema`.
- UI "reales + bonificadas + aviso": panel hero ("X verificadas / se pagan N de X · tope del periodo"), `/panel/resenas`, `ProducerSummary`, Excel individual (total capado). Editable en ficha de comercial/director.
- Commits `b626594`, `e4ad2e9` (copy "verificadas" en vez de "abonables" para no confundir). Detalle: **CLAUDE.md §4.49**.

### C. 🎉 Google Business Profile API ACTIVADA (caso `5-5855000041022`)
Google aprobó la cuota. Se activó **going-forward, fuente única**:
- **Bug del resource**: el picker guardaba `locations/456` pero la v4 exige `accounts/123/locations/456` → 404. Fix en `linkGoogleLocation` (compone el resource) + backfill de las 7 fichas (vía service-role). Commit `3aaa6bd`.
- **"Solo de ahora en adelante"** (decisión negocio): corte `BP_GO_LIVE_AT="2026-06-10T00:00:00Z"` en el cron → NO importa histórico (Oropesa 1.622) → **cero email-storm de alertas ≤2★**. Verificado: entraron 10 reseñas de hoy (todas 5★, 0 alertas).
- **Fuente única BP**: Places apagado (cron fuera de `vercel.json`); GitHub Action horaria repuntada a BP (renombrada `sync-reviews-hourly.yml`). Sin duplicados. 2 clones transitorios de Places (05:00) deduplicados a mano.
- **Responder por API**: botón "Publicar en Google" en `/resenas/respuestas` para reseñas BP (`publishReviewReply`). Sidebar "Respuestas" reactivado. Commits `f3e526f`, `c4d7549`, `25648eb`, `9d89675`. Detalle: **CLAUDE.md §4.50**.

### D. Matcher: desempate comercial>director (§4.38)
A petición del usuario: si el texto nombra a un **comercial (sales) Y a un director (office_director)**, se atribuye al **comercial** (es quien produce). Solo si queda exactamente 1 `sales`; con 0 ó ≥2 sigue ambiguo. `CommercialInfo` gana `role`; helper `resolveMentionBySalesPreference`; ambos crons cargan `role`. Caso real: clientes internacionales que agradecen a "Katalin y Pavel". Commit `af8ca49`. Detalle: **CLAUDE.md §4.38**.

---

## 2. Estado operativo

- **Migraciones 001–026 aplicadas** en Supabase (023 helpdesk, 024 review replies, 025 reviews_manager write, 026 commission_cap — todas confirmadas por el usuario). **No queda ninguna pendiente.**
- **Business Profile**: cuota ACTIVA. 7 fichas conectadas por OAuth (`accounts/111197444117937021993`), `google_location_resource` = recurso completo. Fuente única. Places apagado. Diagnóstico: `node scripts/check-bp-quota.mjs` → 200 en todas.
- **Tope de comisión**: productores con `commission_cap = 5` (default).
- **Tests**: `npm test` → **316 verdes**. `npm run typecheck` ✅.
- **Deploy**: todo pusheado a `main`. Verificar en Vercel que el último deploy está **Ready** (especialmente el de la activación BP, para que el cron horario use el código con corte).

---

## 3. Cómo verificar (humo, en prod)

1. `/resenas/verificacion` → "Sin atribuir": las reseñas nuevas de hoy; "Atribuidas": reasignar las mal atribuidas.
2. `/resenas/respuestas` (como gestor): las reseñas BP muestran botón **"Publicar en Google"** (un clic publica por API). Las viejas de Places siguen con flujo manual.
3. `/panel` (como comercial con >5 verificadas): número grande = **verificadas** reales; debajo "se pagan 5 de X · tope del periodo"; € sobre el tope.
4. `/comerciales/[slug]`: campo **"Reseñas bonificables"** editable (default 5, vacío = sin tope).
5. `/fichas`: pill "Business Profile" (verde).

---

## 4. Watch-outs / gotchas al retomar

- ⚠️ **Email de commit para Vercel**: usar **`alejandro.castillo@inseryal.es`** (config del repo). NO gmail — Vercel bloquea el deploy.
- ⚠️ **BP es going-forward**: el cron solo importa reseñas con `createTime >= BP_GO_LIVE_AT` (no histórico). Si algún día se quiere histórico, subir/quitar el corte CON CUIDADO (suprimir alertas ≤2★ durante la carga, o sería un email-storm).
- ⚠️ **Fuente única BP**: Places está apagado. NO reactivar su cron sin añadir dedup Places↔BP (si no, clones). El código de Places sigue ahí, reactivable.
- ⚠️ **RLS `profiles_self_update`**: al añadir CUALQUIER columna sensible a `profiles`, congélala en la policy (mig más reciente) + añádela a `FROZEN_COLUMNS` en [lib/__tests__/rls-self-update.test.ts](lib/__tests__/rls-self-update.test.ts). Ver **CLAUDE.md §4.36**.
- ⚠️ **Comisión con tope**: cualquier superficie que muestre € de comisión debe usar `lib/commission.ts` (`commissionEuro`/`payableCount`), no `rate × counted`. Ver **§4.49**.
- **Migraciones**: las aplica el usuario a mano en Supabase → SQL Editor. Confirmar aplicada antes de pushear código que lea una columna nueva.

---

## 5. Pendientes (contexto)

- **BP — pendientes deliberados** (§4.50): deep-link a reseña concreta (Google no expone URL pública por reviewId — descartado), **soft-delete automático** (`reconcileRemoved`, diferido por falsos positivos — reactivar solo desde cron BP con capa `last_seen_at`), sync del `reviewReply` de Google en el cron (auto-marcar respondidas las contestadas directo en Google, §4.26 Bloque G punto 18).
- **🔜 Soporte en mobile** (§4.45/§8.5): inalcanzable en mobile; plan = tarjeta en `/perfil`.
- **Diferidos de auditoría** (§4.37): H2 (lock cron 60s a escala), M2 (reassign sin cliente).
- **Backlog v2 / open questions**: CLAUDE.md §8 + spec.md §9 (dominio, branding, CRM, retención, cifrar `oauth_refresh_token`).

---

## 6. Comandos

```bash
npm run dev          # dev en localhost:3000 (Turbopack)
npm run typecheck    # gate antes de cerrar tarea
npm test             # Vitest (316 verdes)
npm run build        # build producción
npm run lint         # next lint
```
