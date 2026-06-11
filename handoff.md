# Handoff — ReseñaHub

> Traspaso de trabajo (no de diseño). Para el handoff de integración de diseño desde Claude Design, ver [`handoff-template.md`](handoff-template.md).
>
> **Fuentes de verdad permanentes**: [`CLAUDE.md`](CLAUDE.md) (estado + workarounds) y [`spec.md`](spec.md) (producto). Este archivo resume la **última tanda de trabajo** y el estado operativo para retomar rápido. Las memorias locales (`~/.claude/projects/.../memory/`) NO viajan entre máquinas — la continuidad cross-máquina es CLAUDE.md + spec.md + este handoff.

**Última actualización**: 2026-06-11 · **Rama**: `main` · **HEAD**: `33c7ef6` — slugs nombre+primer-apellido + alias previous_slug (mig 027)

---

## 0. Qué se hizo en la sesión del 2026-06-11 (slugs)

### Slug del productor = nombre + primer apellido + alias `previous_slug` (mig 027) — §4.53
Dirección pidió que el enlace público `/c/{slug}` lleve solo **nombre y primer apellido** (33 de 53 productores tenían dos apellidos: `tono-sanchez-abadia`…).
- **mig 027** (aplicada): `profiles.previous_slug` + índice único parcial + `profiles_self_update` reescrita congelando la columna (regla §4.36 — un sales no puede secuestrar el enlace viejo de otro).
- **Fallback de alias** en [lib/landing.ts](lib/landing.ts): si el lookup por `slug` falla, segundo lookup por `previous_slug` → **los QRs impresos y WhatsApps ya enviados siguen redirigiendo Y atribuyendo** al mismo comercial. Colisiones comprobadas contra slug+alias en `createInvitedProfile` y `restoreSales`/`restoreDirector`; `archiveSales`/`archiveDirector` limpian el alias.
- **Renombrado one-shot aplicado** (script gitignored `scripts/rename-producer-slugs.mjs`, dry-run + `audit_log action='slug_renamed'`): 33/33. Compuestos conservados (`maria-jesus-lozano`, `ana-isabel-prior`, `jefferson-javier-piguave`); `victor-clemente-moro` → `victor-clemente` (decisión admin).
- **Altas futuras**: campo "Enlace (slug)" **editable** en los modales de invitación (comerciales + directores), auto-rellenado con `shortNameForSlug` ([lib/utils.ts](lib/utils.ts)). ⚠️ La heurística no detecta nombres compuestos ("María Jesús" → sin apellido) — el admin lo corrige en el campo. Server: `inviteSlugSchema`.
- **Verificado E2E en prod**: `/c/tono-sanchez-abadia` (alias) y `/c/tono-sanchez` → 302 a writereview + visita en `share_links` con el `sales_id` correcto.
- Commits `377f169` (feature), `33c7ef6` (docs). Detalle: **CLAUDE.md §4.53**.
- ⚠️ Incidente menor de la mañana: otra sesión arrastró con `git add -A` esta feature A MEDIO HACER (commit `c8021bf` → **build rojo en Vercel, ignorable, quedó Stale**); se revirtió en `f3c7c35` y la feature completa entró después con gate verde. Lección en memoria: nunca `git add -A` con sesiones paralelas en el mismo working tree.

---

## 1. Qué se hizo en la sesión del 2026-06-10

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

### E. Fix: guardar solo el texto original, sin la traducción de Google (§4.51)
La API v4 de BP incrusta una traducción automática en el `comment` cuando el idioma de la reseña ≠ locale de la cuenta (`<original>\n\n(Translated by Google)\n<traducción>`). Se guardaba verbatim → en la plataforma se veía original + traducción pegados (caso Mercedes García). Fix: helper puro `stripGoogleTranslation` ([lib/google/strip-translation.ts](lib/google/strip-translation.ts)) en la normalización del cron BP + backfill one-shot de las 5 reseñas ya afectadas. Commit `82d6fe9`. Detalle: **CLAUDE.md §4.51**.

### F. Respuestas: one-click por API + detección de respuestas puestas en Google (§4.48/§4.50)
El one-click "Publicar en Google" ya estaba cableado para reseñas BP. Esta sesión añadió que la bandeja refleje la realidad de Google:
- **Sync del `reviewReply`** (cierra §4.26 Bloque G p.18): el cron BP detecta respuestas puestas DIRECTO en Google y las saca de "Sin responder" (`reply_via='google_detected'`). Caso A (fresca con reply → insert) + Caso B (`syncExistingReplies`, reseña existente que gana reply después, race-safe). Helper puro `normalizeOwnerReply` ([lib/google/owner-reply.ts](lib/google/owner-reply.ts)). NUNCA pisa `api`/`manual`.
- Bandeja "Sin responder" pasó a **recientes primero**.
- **✅ Verificado E2E en prod**: (a) reseña de prueba "AleCris" en Castellón → "Publicar en Google" → respuesta **live en Google** (`reply_via='api'`); (b) las 10 reseñas que José ya había respondido en Google → `google_detected` al correr el cron; (c) "AleCris" se atribuyó a Almudena por mención. Commit `2b8cdb0`. ⚠️ Google tarda **unos minutos** en exponer una reseña nueva por la API (no es bug). Decisión "solo nuevas": las ~156 históricas de Places NO se reconcilian (siguen manuales). Detalle: **CLAUDE.md §4.48/§4.50**.

### G. Fix menor: `emailHref` con `encodeURIComponent` (mailto)
`URLSearchParams` codifica espacios como `+` (algunos clientes de correo lo interpretan literal en el body). Commit `66f5701`.

### H. Respuestas v2: paginación + filtro de fechas + limpieza de Places antiguas (§4.48)
- **"Respondidas"**: nuevo paginador reutilizable [components/ui/Pagination.tsx](components/ui/Pagination.tsx) (primer paginador del código; `page` param, 25/pág, `.range()`) + RangePicker por `replied_at` (default periodo de comisión). "Sin responder" NO se filtra por fecha. `RangePicker` ganó `resetParams=["page"]`. `buildHref` nunca arrastra `page` (reset a 1 en cualquier filtro).
- **Limpieza one-shot**: las ~167 de Places estaban en "Sin responder" pese a estar ya respondidas en Google (el sync `google_detected` no las alcanza). Script gitignored `scripts/reconcile-places-replies.mjs` (one-shot, no recurrente): casa Places↔Google por autor+estrella+fecha (48h) y marca las respondidas → **"Sin responder" 167→16**. Las 14 leftover ya no existen en Google (borradas/renombradas, son `reconcileRemoved` §4.20, fuera de alcance); 2 sin responder de verdad. typecheck + 329 tests verdes.

### I. §4.47 (clic-temporal) — intento de `pending` PROBADO y REVERTIDO
Tras detectar un falso positivo (reseña rusa "Елена Тесля" atribuida a Adriana Mihalascu, mercado rumano, por un clic 6 min antes; + clon Places+BP que contaba doble), se **probó degradar la §4.47 de `counted` a `pending`** (commit `a446216`) + degradar las 14 ya atribuidas. El usuario lo vivió como "una locura" (triaje manual de 14 de golpe) y pidió **dejarlo como estaba**. **Revertido** (commit `cbed0e2`): el clic-temporal vuelve a `counted` automático. Las 14 restauradas a counted con su comercial original (audit `restore_temporal_attribution`). ⚠️ **Lección (en memoria)**: NO degradar en bloque reseñas ya atribuidas — el usuario prefiere auto-count + corrección puntual en Verificación. El falso positivo concreto de Елена lo arregla el usuario a mano. BP no aporta nada para ligar clic↔reseña (§4.38); el lever real de calidad es la mención, no tocar el auto-count.

---

## 2. Estado operativo

- **Migraciones 001–027 aplicadas** en Supabase (026 commission_cap, **027 previous_slug** confirmada por el usuario el 2026-06-11). ⚠️ La **028** (`missing_since`, soft-delete automático, de la sesión paralela) estaba **pendiente de aplicar** según CLAUDE.md §7 — verificar antes de retomar.
- **Business Profile**: cuota ACTIVA. 7 fichas conectadas por OAuth (`accounts/111197444117937021993`), `google_location_resource` = recurso completo. Fuente única. Places apagado. Diagnóstico: `node scripts/check-bp-quota.mjs` → 200 en todas.
- **Tope de comisión**: productores con `commission_cap = 5` (default).
- **Tests**: `npm test` → **355+ verdes** (+shortNameForSlug +previous_slug en FROZEN_COLUMNS +reconcile-removed). `npm run typecheck` ✅.
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

- **BP — pendientes deliberados** (§4.50): deep-link a reseña concreta (Google no expone URL pública por reviewId — descartado), **soft-delete automático** (`reconcileRemoved`, diferido por falsos positivos — reactivar solo desde cron BP con capa `last_seen_at`). _(El sync del `reviewReply` ya está HECHO — ver §1.F.)_
- **🔜 Soporte en mobile** (§4.45/§8.5): inalcanzable en mobile; plan = tarjeta en `/perfil`.
- **Diferidos de auditoría** (§4.37): H2 (lock cron 60s a escala), M2 (reassign sin cliente).
- **Backlog v2 / open questions**: CLAUDE.md §8 + spec.md §9 (dominio, branding, CRM, retención, cifrar `oauth_refresh_token`).

---

## 6. Comandos

```bash
npm run dev          # dev en localhost:3000 (Turbopack)
npm run typecheck    # gate antes de cerrar tarea
npm test             # Vitest (329 verdes)
npm run build        # build producción
npm run lint         # next lint
```
