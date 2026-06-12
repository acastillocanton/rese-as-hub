# CLAUDE.md

Este archivo lo lee Claude Code automáticamente al abrir el repo. Vive en git → viaja entre Macs → todas las sesiones arrancan con el mismo contexto.

> **Fuente de verdad del producto**: [`spec.md`](spec.md). Si entra en conflicto algo de aquí con la spec, gana la spec.

---

## 1. Resumen

**ReseñaHub** — app interna single-tenant para **Inseryal by Marina d'Or**. Sustituye el parte semanal de reseñas que se compilaba a mano en Excel.

Cuatro roles:
- **admin** — gestor global. Hoy 2 personas: Alejandro Castillo + Rafael Ibáñez (`@inseryal.es`).
- **office_director** (director de oficina, migraciones 011 + 012 + 013) — rol **DUAL**: (a) **admin scoped a SU EQUIPO** (`profiles.director_id`); (b) **comercial productor** con su propio `/c/{slug}`, clientes, reseñas atribuidas (igual que un sales). Cada director gestiona un subset de comerciales dentro de una ficha y a la vez vende él mismo. Una location puede tener varios directores, cada uno con su equipo. Tiene los mismos campos productivos que un sales (`department`, `language` si internacional, `monthly_goal`). Aparece en el leaderboard y en el parte Excel marcado con "★" para distinguirlo. ⚠️ Desde 2026-06-10 (commit `b8ef681`) **NO accede a `/fichas` ni al flujo OAuth** — la gestión de fichas Google pasó a solo-admin (`assertAdmin` en actions + middleware). Sidebar: tres grupos — "Inicio" (Dashboard), "Mi panel" (productor: enlace, clientes, reseñas) y "Mi oficina" (gestor: verificación, comerciales, ranking del equipo). NO accede a `/gestores`, `/ajustes`, `/directores` ni `/fichas`. Solo el admin general invita/edita/elimina directores desde `/directores` (y el reviews_manager también, por paridad con sales).
- **sales** (comercial) — genera enlaces personalizados por cliente, ve sus reseñas, su ranking. Puede tener un `director_id` asignado (su responsable directo). Si es null, queda en el pool del admin/reviews_manager. Desde mig 016 también accede a `/resenas/verificacion` con permiso acotado a "Reclamar" reseñas huérfanas (unmatched) de SU ficha (atribuírselas a sí mismo + un cliente propio o nuevo). No puede confirmar/rechazar/reasignar/eliminar.
- **reviews_manager** (Bel) — comparte vista con admin en Dashboard y comerciales, **con plenos permisos de administración sobre el rol sales** (invitar / editar / reenviar acceso / eliminar — incluye asignar/reasignar `director_id`). Adicional: `/manager/resenas`, `/manager/export` y `/resenas/verificacion` (paridad con admin tras mig 016: confirmar/rechazar/reasignar/markRemoved/restore). NO accede a `/gestores`, `/directores`, `/fichas`, `/ajustes`.

**Flujo**: comercial comparte `resenas.marinadorconstrucciones.com/c/{sales-slug}/{client-slug}` → cliente cae directo en "Escribir reseña" en Google (302) → dos crons diarios (Google Places API + Google Business Profile API) traen las reseñas → algoritmo atribuye al comercial por ventana temporal + nombre del cliente.

**Stack**: Next.js 15.5.18 App Router + Turbopack · TypeScript strict + `noUncheckedIndexedAccess` · Supabase (Postgres + Auth + RLS) · Google Business Profile API con OAuth (fuente única de reseñas desde 2026-06-10, §4.50; Places API legacy apagado pero reactivable) · Brevo SMTP (vía Supabase para magic-links/invites; vía Nodemailer en [lib/email/brevo.ts](lib/email/brevo.ts) para notificaciones transaccionales — claves SMTP independientes) · Vercel Hobby cron diario `5 5 * * *` Business Profile + GitHub Action horaria (`sync-reviews-hourly.yml`) · ExcelJS (dynamic import) · qrcode.react · Zod · lucide-react · Vitest para tests unit.

**Producción**: [`https://resenas.marinadorconstrucciones.com`](https://resenas.marinadorconstrucciones.com). DNS en SiteGround.

---

## 2. Comandos

```bash
npm install            # primera vez en una máquina nueva
npm run dev            # dev en http://localhost:3000 (Turbopack)
npm run build          # build producción (verifica tipos)
npm run typecheck      # tsc --noEmit — pasar antes de cerrar tarea
npm run lint           # next lint (eslint-config-next + jsx-a11y/recommended)
npm test               # Vitest unit tests (329 tests: matcher (incl. atribución por mención del comercial → counted) + date-range (incl. periodo comisión 20→20) + Places + leaderboard + branding + messaging + duplicate-detection + verification-gating + review-url + sales-report + orphan-reviews + low-rating-alerts + panel-motivation + panel-badges + sales-schemas + excel-safe + rls-self-update + utils (transliteración cirílico→latino) + strip-translation + owner-reply)
npm run test:watch     # Vitest en modo watch
npm run test:e2e       # Playwright happy paths (login + admin nav). Primera vez: npx playwright install --with-deps chromium
npm run test:e2e:ui    # Playwright en modo UI interactivo
```

Migraciones SQL: ejecutar en Supabase Dashboard → SQL Editor en orden numérico (`001_*`, `002_*`, …). Las migraciones son `Ask first` (ver §6).

---

## 3. Estado del proyecto

> 🏁 **V1 cerrada el 2026-05-26**. Cubre todo el flujo end-to-end: alta de comerciales/directores/gestores, generación de enlaces, atribución automática, panel del comercial con mobile + ranking, export Excel del gestor, soft-delete, multi-marca, polish (loading states + a11y + E2E Playwright). **🎉 Google Business Profile API activada el 2026-06-10** → fuente única de reseñas going-forward (Places API apagado); ver §4.50.
>
> Producto live y trayendo reseñas reales desde **2026-05-23** vía Google Places API (vía de respaldo mientras esperamos cuota de Business Profile API — caso `5-5855000041022`). **2026-06-09: descubierto que el allowlist anterior estaba RECHAZADO por dominio del solicitante (gmail) ≠ web; reenviado correctamente con cuentas de empresa `@inseryal.es`/`@marinadorconstrucciones.com` al proyecto `628454280082`, a esperar 7-10 días hábiles, re-check 2026-06-23 — ver §4.26.** El cron oficial de Business Profile sigue activo en paralelo; cuando Google apruebe, retomará automáticamente sin redeploy.

| Fase | Estado |
|---|---|
| 1 · Foundation (schema + RLS + auth + landing pública `/c/...`) | ✅ |
| 2 · Admin (`/dashboard`, `/comerciales`, `/gestores`, `/fichas`, `/resenas/verificacion`) | ✅ |
| 3 · Sales desktop (`/panel`, `/panel/enlace`, `/panel/resenas`, `/clientes`, `/clientes/[slug]`) | ✅ |
| 3.b · Sales mobile (ver subsección) | ✅ |
| 4 · Google Business Profile sync + matching | ✅ **ACTIVO desde 2026-06-10** — cuota concedida, fuente única going-forward (§4.50) |
| 4.b · Places API fallback (legacy + sort=newest) | ⏸️ apagado el 2026-06-10 (sustituido por BP; código reactivable) — trajo reseñas reales 2026-05-23→06-10 |
| 4.c · Sync manual + cron horario GitHub Action + soft-delete + estado consolidado | ✅ |
| 5 · Reviews manager (`/manager/resenas`, `/manager/export`) | ✅ |
| 6 · Polish / hardening (auditoría 18 items) | ✅ |
| 7 · Deploy producción | ✅ |
| Perfil global (`/perfil` + avatares) | ✅ |
| Páginas legales (`/privacidad`, `/terminos`) | ✅ |
| Centro de ayuda (`/ayuda`) con manual del comercial + lightbox | ✅ |
| Multi-marca por `locations.brand` (Inseryal + Marina d'Or Construcciones) | ✅ (mig 014, ver §4.22) |
| Director productor pleno (notificaciones, listados, Excel, verificación, /comerciales/[slug]) | ✅ |
| Ranking: Top 10 en `/dashboard` + pantalla `/ranking` con lista completa | ✅ |
| `/panel/ranking` para el rol sales (ranking de su equipo) — pestaña en móvil + item "Ranking" en el sidebar desktop (`SALES_SIDEBAR_GROUPS`, añadido 2026-06-03) | ✅ (2026-05-26) |
| Loading states (`loading.tsx` por route group + `<Skeleton>`) | ✅ (2026-05-26) |
| A11y: `eslint-plugin-jsx-a11y` activo + arreglos puntuales | ✅ (2026-05-26) |
| Tests E2E Playwright (setup + login + admin-nav specs) | ✅ (2026-05-26) |
| Edición de teléfono en ficha del comercial (paridad con director) | ✅ (2026-05-26) |
| Breadcrumbs enlazados a la sección padre en sub-páginas | ✅ (2026-05-26) |
| **🏁 V1 cerrada** | **2026-05-26** |
| Anti-fraude: marcado de reseñas duplicadas por client_id (mig 015) | ✅ (2026-05-26) |
| v2 · Verificación abierta a todos los roles (mig 016) | ✅ (2026-05-26) |
| v2 · Link a ficha de Google en cada listado de reseñas | ✅ (2026-05-26) |
| v2 · Reformar exportación Excel (sidebar → /comerciales, + Excel individual) | ✅ (2026-05-26) |
| v2 · Auto-sugerir vinculación de reseñas huérfanas al crear cliente | ✅ (2026-05-26) |
| v2 · Sales descarga su propio Excel desde /panel/resenas | ✅ (2026-05-26) |
| v2 · Alertas tempranas por reseñas ≤2★ (mig 017) | ✅ (2026-05-26) |
| v2 · Quitar visitas a enlaces de la UI de management (decision negocio) | ✅ (2026-05-26) |
| v2 · Panel mobile: CTA "+ Nuevo cliente" en Topbar, card "Ver mis clientes" simplificada | ✅ (2026-06-01) |
| v2 · Objetivo mensual por defecto bajado de 50 a 5 (mig 018 + bulk update perfiles existentes) | ✅ (2026-06-01) |
| v2 · Mensajes motivacionales del panel varían por día de la semana (7 variantes × 3 estados) | ✅ (2026-06-01) |
| v2 · 3 plantillas de mensaje por cliente + personalizables por comercial (mig 019) | ✅ (2026-06-01) |
| v2 · Panel: bloque "Histórico, ranking e insignias" (barras 6 meses + últimas reseñas + posición en equipo + insignias derivadas, sin migración) | ✅ (2026-06-01) |
| v2 · Periodo de comisión (20→20) protagonista en el panel del comercial + tarifa €/reseña por productor (mig 020) | ✅ (2026-06-01) |
| v2 · Matcher: la mención del comercial en el texto cuenta en automático (counted), revisa §4.38 | ✅ (2026-06-02) |
| v2 · Auto-vínculo de reseñas huérfanas casi-exactas (≥90) al crear cliente (§4.28) | ✅ (2026-06-02) |
| v2 · Manual de Ayuda ampliado a 14 secciones + glosario (cubre todo v2) + botón "Sincronizar ahora" en el panel del comercial | ✅ (2026-06-02) |
| fix · Transliteración cirílico→latino en `slugify` + `full_name` del cliente (nombres de Europa del Este ya no rompen la creación de cliente/enlace, §4.39) | ✅ (2026-06-03) |
| fix · Anillo del objetivo en `/panel` se quedaba al 75% al cumplir el 100% (`strokeDashoffset` sobrante en `Ring.tsx`) | ✅ (2026-06-03) |
| feat · Foto de perfil gestionada por admin/gestor (comerciales + directores) y por director (sus comerciales) — §4.40 | ✅ (2026-06-03) |
| fix · Ediciones de reseña (Places) ya no crean falsos duplicados: fusión por autor en el sync + limpieza one-shot de 4 grupos — §4.41 | ✅ (2026-06-04) |
| feat · Ficha del comercial (gestión) muestra el resumen productivo del panel (abonables/€/objetivo/evolución/ranking/insignias), alineada al periodo de comisión — §4.42 | ✅ (2026-06-04) |
| feat · Selector de fecha unificado a "Periodo de comisión" por defecto en toda la app (+ "Último trimestre" en el set de atajos) — §4.43 | ✅ (2026-06-04) |
| feat · El admin puede editar el perfil de los gestores (nombre/teléfono/estado/foto) desde /gestores — §4.44 | ✅ (2026-06-04) |
| fix · Aviso de prefijo de país en el teléfono del cliente (alimenta wa.me/SMS) en alta + edición | ✅ (2026-06-04) |
| feat · Sistema de soporte interno (helpdesk): productores preguntan, admin/gestor responden (mig 023) — §4.45 | ✅ (2026-06-04) |
| fix · Footer del sidebar (Soporte/Ayuda/perfil) siempre fijo al hacer scroll: quitar `overflow:hidden` de `Frame` (rompía el `position:sticky`) + `minWidth:0` en los `main` — §4.45 | ✅ (2026-06-04) |
| feat · Pestaña "Atribuidas" en Verificación para reasignar reseñas ya atribuidas (counted) al comercial equivocado — §4.46 | ✅ (2026-06-04) |
| feat(matching) · Atribución por proximidad temporal a un único comercial: reseña sin nombre/mención que casen, tras un clic en el enlace personal de UN solo comercial (ventana ≤30 min) → counted automático sin cliente — §4.47 | ✅ (2026-06-08) |
| fix(matching) · Ventana temporal de §4.47 bajada de 12h a 30 min tras falso positivo en prod (reseña orgánica atribuida por clic genérico 3h antes) + corrección de datos (Miroslava→unmatched, Esteban→counted) — §4.47 | ✅ (2026-06-08) |
| fix · Acceso a Soporte/Ayuda en mobile: tarjeta "Ayuda y soporte" en `/perfil` (links a `/soporte` + `/ayuda`, badge de no-leídos) + punto de aviso azul en el avatar flotante — §4.45 | ✅ (2026-06-11) |
| feat · Responder reseñas de Google desde la plataforma (bandeja `/resenas/respuestas`, admin+gestor): flujo asistido (redactar→copiar→Google→marcar) hoy + API lista para cuando llegue cuota BP (mig 024) — §4.48 | ✅ (2026-06-09) |
| fix · El `reviews_manager` puede escribir sobre `reviews` (reasignar/confirmar/rechazar/responder); le faltaba la policy de UPDATE (mig 025) | ✅ (2026-06-10) |
| feat · Tope de reseñas BONIFICABLES por productor (default 5, configurable, mig 026): € = `min(counted, tope) × tarifa`; UI muestra reales + bonificadas + aviso — §4.49 | ✅ (2026-06-10) |
| fix(reviews) · Guardar solo el texto original de la reseña, sin la traducción incrustada de Google ("(Translated by Google)") — §4.51 | ✅ (2026-06-10) |
| feat(respuestas) · Responder en un clic por API (BP) + el cron detecta respuestas puestas directo en Google (`google_detected`) + bandeja recientes-primero; históricas de Places siguen manuales — §4.48/§4.50 | ✅ (2026-06-10) |
| feat(respuestas) · "Respondidas" con paginación (`Pagination.tsx`, 25/pág) + RangePicker por `replied_at`; barrido one-shot que marca las Places ya respondidas en Google (`google_detected`): "Sin responder" 167→16 — §4.48 | ✅ (2026-06-10) |
| feat(matching) · §4.47 ampliado: si el clic temporal fue en el enlace ESPECÍFICO de un único cliente (`client_id` no nulo), se atribuye también ese cliente (aunque el nombre no case), confianza 80; clic genérico/multi-cliente sigue counted sin cliente — §4.47 | ✅ (2026-06-10) |
| fix(sync) · Ediciones de reseñas BP se reflejan: `syncExistingEdits` actualiza rating/texto in-place (preserva atribución, revive soft-deleted, re-alerta ≤2★ si baja a low) — §4.41 | ✅ (2026-06-11) |
| feat(soporte) · Aviso informativo del horario de atención en `/soporte` y `/soporte/nueva` (intensivo jul/ago, partido el resto; solo el mes en curso) — §4.45 | ✅ (2026-06-11) |
| feat(sync) · Soft-delete AUTOMÁTICO de reseñas borradas en Google (mig 028): sello `missing_since` + umbral 24h, solo cron BP, restauración manual — §4.20 | ✅ (2026-06-11) |
| feat(slugs) · Slug del productor = nombre + primer apellido (33 renombrados via one-shot) + alias `previous_slug` con fallback en landing (mig 027) + campo slug editable en los modales de invitación — §4.53 | ✅ (2026-06-11) |
| feat(reviews) · Deep-link por reseña a Google Maps (mig 029): base + degradación + matcher + URL verificada E2E. ⚠️ Harvest automático BLOQUEADO por anti-automatización de Maps — pendiente decidir pegado manual / CDP — §4.54 + [docs/deep-link-resenas-google.md](docs/deep-link-resenas-google.md) | ⏳ base lista (2026-06-11) |
| feat(reviews) · Deep-link §4.54 RESUELTO sin scraping: spike de derivación offline refutado a nivel de byte (reviewId BP opaco) + Capa 1 cosecha oficial Places API New (`googleMapsUri`, ~5/ficha) + Capa 3 pegado manual (server actions + `<MapsUrlControl>` en /manager/resenas). Capa 1 requiere `GOOGLE_PLACES_API_KEY` para correr | ✅ (2026-06-11) |
| feat(reviews) · Deep-link COBERTURA TOTAL (§4.54 vía B): agente con Chrome real en el PC de oficina ([agent/](agent/)) + botón web "Sincronizar enlaces" (admin+gestor, buzón en audit_log) + modo escucha/autoarranque + matcher unicode-aware (cirílico). Vía C (botón puro Vercel) descartada por spike. **161/176 deep-links (~91%)** | ✅ (2026-06-11) |
| feat(ui) · Nomenclatura visible "Director"→"Responsable" (rol `office_director` intacto, §4.55) + menú del responsable reorganizado (Mi oficina / Mi actividad) | ✅ (2026-06-11) |
| feat(ui) · Botones "Sincronizar reseñas" / "Sincronizar enlaces" con iconos + Topbar derecho fijo · fix(middleware) reviews_manager faltaba `/api/sync` (§4.56) | ✅ (2026-06-11) |
| chore(respuestas) · Limpieza one-shot: 1 clon Places/BP eliminado + 3 reconciliadas por API + 12 históricas marcadas respondidas → "Sin responder" 17→1 (§4.48) | ✅ (2026-06-11) |
| feat(alertas) · Chequeo de salud diario por email (cron `45 5 * * *`, solo a admins, solo si hay algo): agente parado/DOM roto · fichas sin sincronizar · backlog de huérfanas · emails fallidos. Latido `harvest_ran` en el agente. Sin migración (§4.57) | ✅ (2026-06-12) |

### Vista mobile (Fase 3.b + extensión director)
Roles con vista mobile (`≤767px`): **sales** (fase 3.b) y **office_director** (extensión migración 011). Admin y reviews_manager siguen desktop-only por diseño (uso en oficina). Implementado con **CSS media queries puras** (sin hooks JS, sin route group duplicado, sin flicker SSR) con clases prefijadas `m-*` al final de [`app/globals.css`](app/globals.css).

Originalmente las clases eran `sales-*` cuando solo el comercial tenía mobile. Cuando el director ganó mobile también, se renombraron a `m-*` (mobile) — son helpers responsive role-agnósticos. La decisión de pintar `MobileTabBar` + ocultar `Sidebar` es lo único role-conditional y vive en cada layout.

Chrome mobile (sales + director):
- Sidebar 232px oculto via `.m-hide-mobile`.
- [`<MobileTabBar />`](components/layout/MobileTabBar.tsx) fija inferior con 4 tabs, iconos lucide, `padding-bottom: env(safe-area-inset-bottom)`. Acepta un prop `tabs: MobileTab[]` y exporta dos constantes:
  - `SALES_MOBILE_TABS`: Panel · Enlace · Reseñas · Ranking (consumida por [(sales)/layout.tsx](app/(sales)/layout.tsx)).
  - `DIRECTOR_MOBILE_TABS`: Inicio · Mi enlace · Equipo · Reseñas (consumida por [(admin)/layout.tsx](app/(admin)/layout.tsx) y [(manager)/layout.tsx](app/(manager)/layout.tsx) cuando el rol es `office_director`; la tab "Mi ficha" se retiró cuando `/fichas` pasó a solo-admin, commit `b8ef681`).
- Para sales: "Clientes" no está en la tab bar (fidelidad al mockup). Se accede desde card mobile-only **"Ver mis clientes"** en `/panel`. El Topbar del Panel tiene **"+ Nuevo cliente"** como CTA principal (en lugar de "Buscar mis reseñas" y "Compartir mi enlace", que se eliminaron del Panel para que cada acción viva en su pantalla: Reseñas y Enlace respectivamente). El botón usa el componente [`NewClientButton`](app/(sales)/clientes/NewClientButton.tsx) importado directamente en [`panel/page.tsx`](app/(sales)/panel/page.tsx).
- Para director: `/manager/export` y `/perfil` se acceden navegando desde el resto de pantallas (no caben 5 tabs).
- [`/panel/ranking`](app/(sales)/panel/ranking/page.tsx) = ranking del propio equipo del comercial (sales con su mismo `director_id`, o pool de huérfanos si su director_id es null). Cards verticales con [`<LeaderboardCardList>`](components/ranking/LeaderboardCardList.tsx); la card del propio comercial se destaca con borde tinta y badge "Tú". RLS se sortea con service-role server-side filtrando por `director_id` calculado desde la sesión (no es query-param). Implementado 2026-05-26.

Clases mobile (todas `!important` para vencer al inline `style={{}}` desktop): `m-hide-mobile` / `m-hide-desktop` / `m-mobile-only`, `m-page-pad`, `m-grid-hero` / `m-stats-3` / `m-stats-4` / `m-qr-grid` / `m-detail-grid`, `m-ring-row`, `m-callout-wide` (libera el `maxWidth: 240` del callout del objetivo a ancho completo solo en mobile; en desktop el callout va contenido — ver §4.32), `m-review-row` + `m-review-pill`, `m-rangepicker-popover`, `m-topbar-compact` (activada con prop `compact` de `Topbar`).

`ClientRowItem` mantiene dos sub-layouts coexistentes (desktop grid 5 cols + mobile card vertical) compartiendo estado. Las tablas del director en `/comerciales` (y la de `/fichas`, hoy solo-admin) usan `overflowX: auto` + `minWidth: 720-920px` para permitir scroll horizontal en mobile (acabado "aceptable", no se reescriben a cards).

### Fase 4 · Google (detalle)
Código completo en [`lib/google/business-profile.ts`](lib/google/business-profile.ts) (cliente OAuth + reviews v4 con `fetchWithRetry` para 429/5xx), [`lib/matching/attribute-review.ts`](lib/matching/attribute-review.ts) (ventana 48h + similitud Unicode-aware; thresholds 75/40, **modo `anonymous_author` cuando Google no devuelve displayName: usa ventana corta 4h y solo asigna `pending` si hay UN único candidato**), [`/api/cron/sync-google-reviews`](app/api/cron/sync-google-reviews/route.ts) (paginación + early-exit + idempotencia por `unique (location_id, google_review_id)` + **lock optimista contra solapamiento** + **email notificación en batch con `Promise.allSettled` al final** + `.limit(10000)` defensivo en share_links), [`/api/google/oauth/*`](app/api/google/oauth/) (consent + token swap + state CSRF), [`/fichas/[id]/conectar`](app/(admin)/fichas/[id]/conectar/page.tsx) (UI selección). Email transaccional al comercial cuando entra `counted` en [`lib/email/notify-new-review.ts`](lib/email/notify-new-review.ts) con `escapeHtml` aplicado a todo input externo. Endpoint admin [`/api/admin/notify-failed`](app/api/admin/notify-failed/route.ts) (GET lista pendientes, POST reintenta) para emails de notificación que fallaron — registra `notify_retry_ok` / `notify_retry_failed` en `audit_log`.

OAuth flow validado E2E. **✅ Cuota concedida y ACTIVA desde 2026-06-10** (caso `5-5855000041022`): las APIs `mybusiness*` devuelven 200, las 7 fichas conectadas, BP es la fuente única going-forward. Ver §4.50 para el estado vivo y la activación. (Histórico: del 2026-06-04 al 06-10 la cuota estuvo a 0 — `429 RESOURCE_EXHAUSTED` con `quota_limit_value: "0"` — hasta que Google aprobó el allowlist reenviado el 06-09; ver §4.26.)

Tests unit del matcher en [`lib/matching/__tests__/attribute-review.test.ts`](lib/matching/__tests__/attribute-review.test.ts) (22 tests cubriendo `nameSimilarity` + flujo con autor real + modo anonymous).

### Fase 4.b · Places API fallback (detalle)

Vía de respaldo para no depender de la aprobación de cuota de Business Profile. Iterado en dos rondas: la inicial con Places API (New) que devolvía top-5 "relevantes" (insuficiente para fichas con histórico largo), y la actual con **Places API legacy + `reviews_sort=newest`** que devuelve las 5 **más recientes**.

**Cron Places** ([`/api/cron/sync-places-reviews`](app/api/cron/sync-places-reviews/route.ts)):
- Cliente [`lib/google/places.ts`](lib/google/places.ts) consume el endpoint **legacy** `maps.googleapis.com/maps/api/place/details/json?fields=reviews&reviews_sort=newest&language=es&key=…`. La API key (`GOOGLE_PLACES_API_KEY`) vive en query string. Necesita habilitada "Places API" (sin "New") en Google Cloud Console — la "New" no soporta este parámetro.
- Devuelve las 5 más recientes por ficha. No pagina. Mismo patrón que usa el plugin propio Reviby en producción.
- `google_review_id` se **sintetiza** como `places:{place_id}_{unix_time}_{md5(author).slice(0,8)}` porque el endpoint legacy no devuelve `review_id` estable.
- Cuota gratis Google Maps Platform ($200/mes free credit ≈ 11.000 Place Details). Coste real Inseryal con cron horario × 7 fichas × 18h/día ≈ 126 req/día → cero coste.
- Helper compartido [`lib/cron/process-reviews.ts`](lib/cron/process-reviews.ts) con `processFreshReviews()` + `flushNotifications()`. Toda la orquestación específica de Places vive en [`lib/google/sync-places.ts`](lib/google/sync-places.ts) (`syncPlaces({ locationIds? })`).
- Lock optimista compartido vía `oauth_last_sync_at`: si un cron procesó una ficha hace <60s, el otro hace skip.

**Cron horario externo** ([`.github/workflows/sync-places-hourly.yml`](.github/workflows/sync-places-hourly.yml)):
- GitHub Action diariamente cada hora a y media (minuto 30, 06-23 UTC) llama al mismo endpoint del cron Vercel con `Authorization: Bearer ${CRON_SECRET}`.
- Razón: Vercel Hobby solo permite cron diario. Places no pagina; un solo sync/día perdería reseñas en fichas activas. Con sync cada hora, una ficha tendría que recibir >5 reseñas en menos de 1 hora para perder alguna — improbable.
- Requiere dos secrets en GitHub repo → Settings → Secrets: `APP_URL` (URL de prod) y `CRON_SECRET` (mismo valor que en Vercel).

**Sincronización manual** ([`/api/sync/now`](app/api/sync/now/route.ts)):
- ⚠️ **Desde 2026-06-10 sincroniza vía Business Profile** (`syncBusinessProfile`, no `syncPlaces`): Places se apagó (§4.50) y el endpoint manual seguía llamando a `syncPlaces` → Places caído colgaba hasta el timeout de Vercel → HTML 504/500 → el botón hacía `res.json()` sobre HTML → "Unexpected token '<'". Fix: la lógica del cron BP se extrajo a [`lib/google/sync-business-profile.ts`](lib/google/sync-business-profile.ts) (`syncBusinessProfile({ locationIds? })`, mismo patrón que `syncPlaces`, "nunca lanza") y la usan tanto el cron como el sync manual. Además `<SyncNowButton>` ahora protege el `res.json()` (si no es JSON, mensaje claro en vez del error críptico).
- POST autenticado por cookie de sesión (no por CRON_SECRET).
- Admin / reviews_manager sin body → todas las fichas conectadas; con `{ location_id }` → solo esa.
- Sales / office_director → ignora body; sincroniza únicamente su `profiles.location_id` (si está conectada).
- Botón [`<SyncNowButton />`](components/ui/SyncNowButton.tsx) reutilizable en `/fichas` (admin: global + por fila), `/manager/resenas` (gestor) y `/panel/resenas` (comercial — añadido 2026-06-02; `/api/sync/now` ya soportaba el rol `sales` sincronizando su `location_id`).

**Importador manual** ❌ ELIMINADO 2026-05-23 (PR #9): existía la pantalla `/manager/resenas/importar` para meter reseñas a mano, pero el cron horario + el botón "Sincronizar ahora" cubren todos los casos. Se eliminó para simplificar y evitar el riesgo de reseñas inventadas. El enum `review_source_enum` mantiene el valor `'manual'` por compatibilidad pero ya no entra ningún registro nuevo con esa fuente. Resucitable desde el historial git de la rama `feature/places-fallback` (commit `6aaae66`).

**Migración 009 — columna `source` enum**:
- `business_profile` (default) | `places_api` | `manual` (legacy, ver arriba).
- Prefijo en `google_review_id`: raw para Business Profile, `places:{id}` para Places. Evita colisiones del `unique (location_id, google_review_id)`.
- ⚠️ **Duplicados conocidos** al activar Business Profile (misma reseña con dos IDs distintos): resolución one-shot documentada en §4.26 Bloque B.

**Tests**: 20 del cliente Places API (`lib/google/__tests__/places.test.ts`) + 5 del helper de reconciliación.

### Fase 5 · Gestor (detalle)
Decisión: el gestor unifica vista con admin en lugar de un universo paralelo `/manager/*`. Comparte `/dashboard` y `/comerciales/*` con plenos permisos sobre sales. Pantallas propias: [`/manager/resenas`](app/(manager)/manager/resenas/page.tsx) y [`/manager/export`](app/(manager)/manager/export/page.tsx) (.xlsx con detalle + resumen dashboard). Gating: helper [`assertCanManageSales()`](app/(admin)/comerciales/actions.ts) en las 4 acciones de comerciales. RLS: migración [`005_manager_sales_admin.sql`](supabase/migrations/005_manager_sales_admin.sql) — `with check` impide escalar un sales a admin/manager.

### Centro de ayuda (`/ayuda`) — manual del comercial

Pantalla [`app/(profile)/ayuda/page.tsx`](app/(profile)/ayuda/page.tsx) accesible a los **cuatro roles** desde el sidebar (item "Ayuda" abajo del todo, encima del avatar, icono LifeBuoy). Pensada para comerciales con poca soltura informática: lenguaje muy simple, pasos numerados, callouts, glosario y capturas.

**Reescrita y ampliada a v2 (2026-06-02)**: de 10 a **14 secciones** + glosario de 10 términos + ~12 FAQs. Cubre todo lo nuevo de v2 (antes solo login + panel básico). Orden pensado para que "lo que cobro" y "cómo conseguir que la reseña sea mía" lleguen pronto:
1. Bienvenida · 2. Entrar por primera vez · 3. Cómo te mueves (móvil vs escritorio) · 4. Tu panel · 5. Periodo de comisión (20→19) · 6. Qué cuenta para cobrar (abonable/por verificar/duplicada) · 7. Dar de alta cliente · 8. Compartir enlace · 9. Tus 3 plantillas (editor) · 10. La clave: que la reseña sea TUYA (enlace personalizado + mención del comercial) · 11. Cuándo aparecen tus reseñas (+ botón "Sincronizar ahora") · 12. Reclamar huérfanas ("Es mía") · 13. Ranking/Excel/perfil · 14. FAQ + glosario.
- Quitado lo desfasado: KPIs de "visitas" del panel y el botón inexistente "Buscar mis reseñas"; nombres propios neutralizados ("tu administrador" / "el gestor").
- **Capturas en [`public/help/`](public/help/)** (`01`…`17`, faltan 13/14 por consolidación): 15 en total. Las 9 nuevas/regeneradas (`02`,`07`,`08`,`10`,`11`,`12`,`15`,`16`,`17`) se capturaron el 2026-06-02 desde la cuenta del comercial **Cornel Popescu** (autorizada por el admin) en local con el código v2, vía Chrome DevTools MCP + login `/login/manual?token=…`, ocultando el indicador de Next DevTools. Las 6 de v1 (`01`,`03`,`04`,`05`,`06`,`09`) se reutilizan. ⚠️ `public/` se sirve **sin auth**, así que las capturas muestran datos de un comercial real (decisión consciente del admin); ver aviso en [`public/help/README.md`](public/help/README.md).
- Componente [`<HelpFigure />`](components/help/HelpFigure.tsx): placeholder cuando la imagen no existe + **lightbox** al click. Usa `maxWidth:100%` (no `width:100%`) para no AMPLIAR capturas estrechas; prop opcional `maxWidth` para topar el ancho de las verticales (móvil 300px, sidebar 240px) — sin él se verían enormes en el contenedor ancho (fix 2026-06-02).
- Permitido en middleware (`/ayuda` siempre accesible). KPI "Ficha más activa" en `/manager/resenas` se sustituye dinámicamente por "% con comentario" cuando hay filtro de ficha aplicado (PR #7).

### Fase 6 · Polish / hardening (auditoría 18 items, 2026-05-22)

Auditoría exhaustiva (seguridad + bugs + rendimiento) con 18 hallazgos. Resueltos todos en commits `849c63f`, `69c610a`, `0b656d7`:

**🔴 Críticos resueltos**:
- `.limit(5000)` en `/api/export/reviews` y `.limit(50000)` en share_links → evita timeout Vercel con volumen real.
- Email batch en cron (`Promise.allSettled` al final del loop) → si Brevo timeout en uno, el cron no muere.
- Tests Vitest unit del matcher + date-range (36 tests).

**🟠 Altos resueltos**:
- CSP completo en `next.config.ts` (Supabase + Google + Google Fonts + imágenes).
- Error handling reforzado en `(perfil)/actions` (publicUrl) y `(admin)/fichas/actions` (desconectar Google aborta si falla borrar location_secrets).
- Migración 007 con índices compuestos `(sales_id, google_created_at desc)`, `(location_id, ...)`, `(client_id, ...)` parcial, `(match_state, ...)` en `reviews`.
- `count: "planned"` en KPIs no comparativos (clients total en dashboard, visitas QR totales en /panel/enlace).

**🟡 Medios resueltos**:
- Lock optimista en cron (`UPDATE oauth_last_sync_at` atómico con filtro temporal → skip si otro corrió en <60s).
- Endpoint `/api/admin/notify-failed` (admin only) para listar y reenviar emails fallidos.
- `parseRange()` cae al mes actual si `from > to` (antes invertía silencioso).
- Modo `anonymous_author` en matcher (sin nombre + 1 candidato cercano → pending; antes caía a unmatched siempre).
- `.limit(10000)` defensivo en share_links del cron + `order opened_at desc`.

**🟢 Bajos resueltos**:
- Validación defensiva del token_hash en `/login/manual` (formato base64url-ish, longitud 20-200).
- `export const dynamic = "force-dynamic"` en `/panel`, `/panel/enlace`, `/panel/resenas`, `/dashboard`.
- `noUncheckedIndexedAccess: true` en `tsconfig.json` + arreglados ~60 errores resultantes en 9 archivos.
- Migración 008: columna `actor_id` en `audit_log` + policy `audit_log_self_insert`.
- ExcelJS pasa a dynamic import en `/api/export/reviews`.

**Skipped (documentado)**:
- `revalidateTag` en server actions: requiere envolver TODAS las queries Supabase en `unstable_cache`. Refactor grande sin valor inmediato (las páginas son `dynamic`, no hay caché que invalidar). Pendiente para cuando haya `unstable_cache`.

**Pendiente de Fase 6** (no aborda la auditoría, son items separados):
- ~~Loading states (`loading.tsx` por route group).~~ ✅ 2026-05-26: `app/(admin|sales|manager|profile)/loading.tsx` con `<PageLoadingShell>` compartido (Topbar fake + Card skeletons). `components/ui/Skeleton.tsx` con shimmer + `prefers-reduced-motion`.
- ~~A11y (audit + arreglos puntuales).~~ ✅ 2026-05-26: activado `eslint-plugin-jsx-a11y/recommended` en `.eslintrc.json`. Arreglos: `LeaderboardTable` ARIA tabular (role=table/row/cell), `SyncNowButton` aria-busy, focus rings globales ya estaban en globals.css. Modal backdrops con click-outside quedan como `warn` (deuda: refactor a componente Dialog compartido con focus trap + Escape handler).
- ~~Tests E2E Playwright.~~ ✅ 2026-05-26: setup completo en `playwright.config.ts` + helper `e2e/helpers/auth.ts` (login vía `/login/manual?token=…`, no necesita magic-link real). 2 specs: `e2e/login.spec.ts` + `e2e/admin-nav.spec.ts`. Scripts `npm run test:e2e` + `test:e2e:ui`. Falta correr `npx playwright install --with-deps chromium` la primera vez.
- Seed más realista para dev (datos de prueba que reflejen escala futura).

---

## 4. Workarounds operativos vigentes

### 4.1 Auth por email — flujo OTP `token_hash` (no PKCE)
Los tres caminos (login, invite, reenviar acceso) terminan en [`/auth/confirm`](app/auth/confirm/route.ts) → `verifyOtp({ token_hash, type })` server-side. PKCE rompía con email scanners + cross-device (ver §4.9 y §4.10).

- **Login** ([`LoginForm.tsx`](app/login/LoginForm.tsx)) usa cliente vanilla `@supabase/supabase-js` con `flowType: 'implicit'`. Sin `emailRedirectTo`.
- **Invite** ([`lib/invite.ts`](lib/invite.ts)) y **reenviar** ([`lib/auth/resend-link.ts`](lib/auth/resend-link.ts)) usan `auth.admin.generateLink()` con service-role y devuelven URL del tipo `/auth/confirm?token_hash=...&type=invite|magiclink&next=...`.

Plantillas en Supabase Dashboard (editar a mano):
- Magic Link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=%2F` ⚠️ `type=email`, NO `magiclink` (deprecated → devuelve `otp_expired`).
- Invite: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=%2Fpanel`.

### 4.2 Workaround manual de login si Supabase Auth rate-limita
[`/login/manual?token=<hashed_token>`](app/login/manual/page.tsx) redirige a `/auth/confirm`. Para generar el token desde terminal:
```bash
set -a && source .env.local && set +a && \
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"<email>"}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("http://localhost:3000/login/manual?token="+d.get("hashed_token",""))'
```

### 4.3 Status auto-flip `invited` → `active`
[`/auth/confirm`](app/auth/confirm/route.ts) hace `UPDATE profiles SET status='active' WHERE id=user.id AND status='invited'` tras `verifyOtp` exitoso. `paused` se respeta; el admin puede forzar el estado desde la ficha.

### 4.4 Hydration warning silenciado
[`app/layout.tsx`](app/layout.tsx) usa `suppressHydrationWarning` en `<html>` porque alguna extensión del navegador inyecta `className="light"` antes de hidratar.

### 4.5 Workspace root explícito en `next.config.ts`
Hay un `package-lock.json` huérfano en `/Users/usuario/` que confunde a Next 15.5+. Sin fijar workspace root: Turbopack toca `~/Documents` → TCC niega → dev muere; build webpack → "Cannot find module for page: /_document".

[`next.config.ts`](next.config.ts) tiene `turbopack: { root: __dirname }` + `outputFileTracingRoot: __dirname`. **NO QUITAR**.

### 4.6 `audit_log` siempre via service-client
La tabla tiene RLS habilitada. Desde migración 008 hay policy `audit_log_self_insert` que permite a cualquier authenticated insertar SOLO si `actor_id = auth.uid()`. El helper [`recordAudit()`](lib/audit.ts) sigue usando service-client (bypasea RLS) para casos donde el actor es el sistema (cron, webhooks) o cuando no se pasa actor_id. Si se quisiera permitir audits con actor humano desde cookie-context, pasar `actor_id` y usar el client server normal.

### 4.7 Eliminar y recrear perfiles → liberar `auth.users`
`generateLink({ type: "invite" })` rechaza con `email_exists` si queda el `auth.user`. `deleteSales` / `deleteReviewsManager` borran ambos (profile + auth.user) vía service-client. Para recuperar acceso sin perder historial, usar **"Reenviar acceso"** en lugar de eliminar + reinvitar.

### 4.8 Dev server peta con `.next/...not found`
Caché Turbopack corrupta tras `npm install` parcial o proceso huérfano. Reset:
```bash
pkill -f "next" 2>/dev/null; sleep 2
rm -rf .next node_modules
npm install && npm run dev
```

### 4.9 `HEAD` handler vacío en `/auth/confirm`
Email scanners (Microsoft Safe Links, antivirus, link previewers) hacen `HEAD` a las URLs del email al recibirlo. Sin handler `HEAD` explícito, Next.js ejecuta el `GET` completo para responder headers → `verifyOtp` consume el token → cuando el usuario pulsa, `otp_expired`.

[`/auth/confirm`](app/auth/confirm/route.ts) exporta un `HEAD` que devuelve `200 OK` sin tocar Supabase. **NO QUITAR**. Síntoma si reaparece: 2 `HEAD 307 /auth/confirm` seguidos del envío del email y `GET` posterior con `otp_expired`.

### 4.10 LoginForm con cliente vanilla `@supabase/supabase-js`
`@supabase/ssr` fuerza PKCE en `createBrowserClient` ignorando `flowType: 'implicit'` → tokens con prefijo `pkce_` → `/auth/confirm` rechaza con `otp_expired`.

[`LoginForm.tsx`](app/login/LoginForm.tsx) importa `createClient` directamente de `@supabase/supabase-js` con `flowType: 'implicit'`, `persistSession: false`, `autoRefreshToken: false`. La sesión la materializa server-side `/auth/confirm`. El resto de la app sigue con `@supabase/ssr`; la excepción es solo el LoginForm.

### 4.11 Vercel Hobby — cron diario máximo
Vercel Hobby rechaza schedules sub-diarios. [`vercel.json`](vercel.json) tiene dos crons: `0 5 * * *` para Places y `5 5 * * *` para Business Profile (5 min de margen, lock optimista compartido). Ambos a las 05:00 UTC ≈ 6 AM España invierno / 7 AM verano. Trade-off: reseñas con delay máx 24h en lugar de 10 min. Alternativas si urge inmediatez:
- Botón "Run" manual en Vercel Cron Jobs UI.
- Cron externo (cron-job.org, GitHub Actions) que llame al endpoint con `Authorization: Bearer <CRON_SECRET>`.
- Upgrade a Pro (~$20/mes).

### 4.12 Brevo — dejar IP whitelist desactivada
Settings → Seguridad → IP autorizadas → toggle "Claves SMTP" debe estar **OFF**. Vercel corre en IPs dinámicas de AWS, no podemos whitelistear de antemano. Si se activa, los envíos fallan con `525 5.7.1 Unauthorized IP address`. La autenticación con `BREVO_SMTP_PASS` ya garantiza la seguridad.

### 4.13 Brevo — dos SMTP keys conviven sin pisarse
- `resenahub-supabase` (2026-05-21) — la consume Supabase Auth para magic-links + invites. Configurada en Supabase Dashboard → Auth → SMTP Settings. **NO TOCAR**.
- `resenahub-app` (2026-05-22) — la consume nuestro código en [`lib/email/brevo.ts`](lib/email/brevo.ts) para emails transaccionales. En `BREVO_SMTP_PASS`.

Ambas comparten login (`7e1a24001@smtp-brevo.com`) y remitente (`info@marinadorconstrucciones.com`). Brevo solo enseña el valor al crear la key — si se pierde, regenerar y actualizar `.env.local` + Vercel + redeploy.

### 4.15 Cron — lock optimista contra solapamiento
[`/api/cron/sync-google-reviews`](app/api/cron/sync-google-reviews/route.ts) hace un `UPDATE locations SET oauth_last_sync_at = now() WHERE id = $1 AND (oauth_last_sync_at IS NULL OR oauth_last_sync_at < now() - 60s)` con `.select("id")` al inicio de cada location. Si la fila devuelta está vacía, otro cron procesó esa location hace menos de 60s → el actual hace skip con `entry.error = "skipped_concurrent_run"`. Atómico en Postgres (UPDATE+WHERE en una transacción).

Esto evita trabajo duplicado y emails dobles cuando el botón "Run" manual de Vercel Cron Jobs UI coincide con el schedule diario.

### 4.16 Cron — email transaccional en batch al final del loop
Los emails al comercial cuando entra `counted` ya NO se envían `await` dentro del loop. Se acumulan en `pendingNotifications[]` durante todo el cron y al final se disparan con `Promise.allSettled(...)` en paralelo. Si entran 50 reseñas, son 50 SMTP simultáneos en lugar de 50 secuenciales (el cron no excede 60s). Los fallos se registran en `audit_log` como `notify_failed` y pueden reenviarse desde [`/api/admin/notify-failed`](app/api/admin/notify-failed/route.ts).

### 4.14 Clases `m-*` (mobile helpers role-agnósticos)
Las clases con prefijo `m-*` en [`app/globals.css`](app/globals.css) usan `!important` para vencer al inline `style={{}}` y solo tienen efecto en `@media (max-width: 767px)`. Originalmente vivían como `sales-*` cuando solo el comercial tenía mobile; se renombraron a `m-*` al añadir vista mobile al rol `office_director` (migración 011).

Reglas:
- Las clases en sí son **role-agnósticas** — puedes aplicarlas a cualquier página que necesite responsive. En desktop son inertes, así que no rompen UX existente.
- Quien sí es role-conditional es el **chrome mobile** (ocultar Sidebar + renderizar MobileTabBar). Cada layout decide si lo pinta según el rol del usuario: `(sales)/layout.tsx` siempre lo pinta; `(admin)/layout.tsx` y `(manager)/layout.tsx` lo pintan solo si el rol es `office_director`; `(profile)/layout.tsx` lo pinta si el rol es `sales` u `office_director`.
- [`Topbar.tsx`](components/layout/Topbar.tsx) acepta prop `compact?: boolean` que pinta clases `m-topbar-*`. Default `false`; las páginas con vista mobile (sales + director) la pasan.
- [`RangePicker.tsx`](components/ui/RangePicker.tsx) lleva siempre `m-rangepicker-popover`. En desktop no hace nada; en mobile evita que el popover de 320px desborde.
- [`MobileTabBar.tsx`](components/layout/MobileTabBar.tsx) acepta `tabs: MobileTab[]` y exporta `SALES_MOBILE_TABS` y `DIRECTOR_MOBILE_TABS`.

### 4.17 Cron Places API — prefijo `places:` y duplicados al activar Business Profile
[`/api/cron/sync-places-reviews`](app/api/cron/sync-places-reviews/route.ts) consume Google Places API (New) sin OAuth. El `google_review_id` se prefija con `places:` (extrayendo el último segmento de `places/{place_id}/reviews/{review_id}`) y la columna `source` se rellena con `places_api`. El importador manual hace lo mismo con `manual:{uuid}` y `source='manual'`.

⚠️ **Duplicados conocidos** al activar Business Profile (misma reseña entra con `places:` y con el `reviewId` raw; el `unique` no colisiona pero se ven dobles en `/manager/resenas`): no urgente, resolución one-shot en §4.26 Bloque B.

**Nunca quitar el prefijo `places:` ni `manual:`**: rompería la idempotencia y crearía colisiones reales al activar Business Profile.

### 4.18 `GOOGLE_PLACES_API_KEY` — API key sin restricción de IP
La API key de Places vive en Google Cloud Console → proyecto `resenas-inseryal` (number `628454280082`) → APIs & Services → Credentials → "Maps Platform API Key". Tiene que tener acceso a las **dos APIs**:
- "Places API (New)" — habilitada inicialmente (no se usa en código activo pero deja la puerta abierta).
- "Places API" (legacy, sin "New") — la que consume el cron actual via `reviews_sort=newest`.

Application restrictions = **None** (Vercel usa IPs dinámicas; el coste por uso acota el blast radius si se filtrara). En Vercel: añadida en Settings → Environment Variables (los 3 environments). Si rotas la key, redeploy obligatorio.

### 4.20 Soft delete de reseñas eliminadas en Google
La tabla `reviews` tiene columna `removed_at` (migración 010). Cuando es NOT NULL:
- La reseña NO aparece en listados (`/manager/resenas`, `/dashboard`, `/comerciales/:slug`, `/panel`, `/panel/resenas`, `/clientes/:slug`, `/api/export/reviews`).
- NO cuenta en KPIs.
- SÍ se conserva en BD (con su `match_state`, `sales_id`, `client_id` intactos) por si Google la restaura.

Solo vía **manual**: server actions `markReviewRemoved` / `restoreReview` en `app/(profile)/resenas/verificacion/actions.ts` (movido en mig 016 desde `(admin)/`). Componente client `<RemovalControls />` integrado en `/resenas/verificacion` (todas las pestañas) y en cada fila de `/manager/resenas`. Acceso: admin + reviews_manager + office_director (scope a su equipo o location). El rol sales NO puede marcar/restaurar.

✅ **Detección automática REACTIVADA (2026-06-11, solo cron BP — mig 028)**: `reconcileRemovedBp` en [lib/google/sync-business-profile.ts](lib/google/sync-business-profile.ts), decisión en el helper puro [lib/cron/reconcile-removed.ts](lib/cron/reconcile-removed.ts) (`decideReconcileRemoved`, tests propios). **Invariante de ventana**: la API v4 lista por `updateTime` desc → el fetch contiene TODAS las reseñas con `updateTime >= min(updateTime bajado)`; toda fila BP de BD con `google_created_at > ese mínimo` debería aparecer — si no aparece, desapareció de Google. **Capa anti-falsos-positivos** (la lección de Places, que marcó 2 reseñas reales como eliminadas en su primer despliegue): la primera ausencia solo sella `reviews.missing_since` (mig 028); el `removed_at` llega únicamente tras **24h de ausencia sostenida** (`AUTO_REMOVE_THRESHOLD_HOURS`, ≥ varios runs horarios); si reaparece antes, se limpia el sello. Acotado a `source='business_profile'` (las ~158 históricas de Places NO son evaluables — sus ids sintéticos nunca casan con el fetch — y quedan fuera a propósito). Las filas más antiguas que la ventana de fetch tampoco se evalúan (cobertura = reseñas recientes, las que importan). `audit_log action='review_auto_removed'`; contador `summary.auto_removed`; try/catch propio (si la mig 028 no estuviera aplicada, el reconcile falla sin tumbar el sync). La restauración sigue siendo **manual** (`restoreReview`, que ahora limpia también `missing_since` para dar 24h de gracia y no re-marcar al run siguiente); el reconcile NUNCA limpia un `removed_at`. (La vieja `reconcileRemoved` de `sync-places.ts` sigue sin llamarse — Places está apagado.)

Filtros UI:
- `/resenas/verificacion?state=removed` → tercera pestaña "Eliminadas (N)".
- `/manager/resenas?match_state=removed` → opción del select "Estado matching".

⚠️ **No quitar el filtro `.is("removed_at", null)`** de los listados de reseñas: las eliminadas no deben aparecer en stats. Para mostrarlas explícitamente, usar los filtros documentados arriba.

### 4.21 Estado de sincronización consolidado en UI (Dashboard + /fichas)
El dashboard y `/fichas` muestran un estado de sincronización que considera **cualquier vía activa**, no solo OAuth:

```ts
// Lógica común en app/(admin)/dashboard/page.tsx y app/(admin)/fichas/page.tsx
const syncing = (l) =>
  l.oauth_status === "connected"  // Business Profile (paginable, preferido)
  || l.google_place_id !== null;  // Places API (fallback activo)
```

Pill mostrada:
- "Business Profile" (verde) → OAuth activo
- "Places API" (verde) → solo place_id (estado actual de Inseryal)
- "Error OAuth" (warn) → BP en error sin place_id de respaldo
- "Sin Place ID" (neutral) → ninguna vía configurada

Cuando llegue cuota BP y conectes una ficha por OAuth, la pill cambia sola a "Business Profile" sin tocar código.

⚠️ NO confundir con la columna `oauth_status` cruda de `locations`. Esa sigue siendo el estado OAuth de Business Profile (puede ser `connected`/`disconnected`/`error`). El "estado de sincronización" es derivado.

### 4.19 Cron horario externo via GitHub Actions
Detalle completo (workflow, schedule minuto 30, secrets `APP_URL` + `CRON_SECRET`, razón) en §4.b "Cron horario externo". Extra: si el endpoint devuelve != 200 el workflow falla y GitHub manda email al maintainer; hay botón "Run workflow" en la pestaña Actions para disparos a demanda.

### 4.22 Multi-marca por `locations.brand`
La app sirve a dos marcas operativas del grupo Marina d'Or:
- **`inseryal`** → "Inseryal by Marina d'Or" (Oropesa, Pardiñas, Príncipe de Vergara, Leganés, Chamberí).
- **`marina_dor_construcciones`** → "Marina d'Or Construcciones" (Castellón, Valencia).

La columna `locations.brand` (enum `brand_enum`, migración 014) gobierna:
- Subtítulo del sidebar (`Director · Marina d'Or Construcciones`).
- Breadcrumb de la topbar (`Marina d'Or` para Construcciones).
- Plantilla del mensaje que el comercial copia al cliente (`"...soy {nombre} de {marca}"`).
- Logo y firma del email transaccional al comercial cuando entra una reseña.

Lo NO afectado (intencional):
- **Routing, RLS, sync, matching** son brand-agnósticos.
- **Páginas legales** (`/privacidad`, `/terminos`) mantienen texto único — la entidad jurídica responsable del tratamiento de datos es del grupo.
- **Centro de ayuda** mantiene texto genérico ("del Grupo Marina d'Or") porque el manual es válido para ambas marcas.
- **Login + metadata** (pre-auth) usan "Grupo Marina d'Or" porque no conocen al usuario aún.
- **Brevo FROM** se mantiene único (`info@marinadorconstrucciones.com`) — la marca la transmite el cuerpo del email (logo + firma), no el header SMTP.

Helpers (puros, sirven en server + client components):
- [`lib/branding.ts`](lib/branding.ts) — `getBrandLabel`, `getBrandBreadcrumb`, `getBrandEmailLogo`, `BRAND_OPTIONS`, `DEFAULT_BRAND`.
- [`lib/supabase/current-brand.ts`](lib/supabase/current-brand.ts) — `getCurrentUserBrand()` server-only: deriva la marca del usuario logueado vía `profiles.location_id → locations.brand`. Fallback `DEFAULT_BRAND` si no tiene location (admin general).

Cuando se crea una ficha nueva, el form en `/fichas` (`AddFichaButton.tsx`) pide la marca explícitamente. La columna tiene default `'inseryal'` como red de seguridad. Solo admin (no director) puede cambiar la marca de una ficha existente vía `EditBrandButton.tsx`.

⚠️ **`weekly-report.ts` sigue brand-agnóstico** — usa `profiles.department` para clasificar por hoja del Excel. Departamento y marca son ortogonales (un comercial nacional puede ser de cualquiera de las dos marcas, en la práctica todos los actuales son `inseryal`; un castellón/valencia es `marina_dor_construcciones`).

### 4.23 Anti-fraude: reseñas duplicadas por `client_id` (mig 015)

Un cliente puede reenviar su enlace `/c/{sales-slug}/{client-slug}` a familia/amigos. Cada uno deja una reseña en Google y el matcher (ventana 48h + similitud) las atribuye al mismo `client_id`. Para evitar inflar KPIs/pagos al comercial, marcamos como duplicadas todas excepto la primera por `google_created_at` dentro de cada `client_id`.

**Reglas**:
- **Principal**: la reseña con `google_created_at` más antiguo por client_id (tie-break: `fetched_at ASC`, luego `id ASC` para determinismo).
- **Duplicadas**: el resto. `is_duplicate=true`, siguen visibles en listados con badge ámbar pero no cuentan.
- Filas con `client_id` null (unmatched) o `removed_at != null` (soft-deleted) están fuera de la lógica.

**Flujo en el cron** ([lib/cron/process-reviews.ts](lib/cron/process-reviews.ts) + helper [lib/cron/duplicate-detection.ts](lib/cron/duplicate-detection.ts)): antes de insertar consulta si ya hay principal del mismo `client_id`. Tres casos:
1. No hay principal → la nueva es principal.
2. Nueva > principal existente (cronológicamente) → marca duplicada.
3. Nueva < principal existente (Places API trae histórico) → la nueva pasa a principal, demota la antigua + entrada `audit_log` con `action='demoted_by_older_duplicate'`.

**Flujo en verificación manual** ([app/(profile)/resenas/verificacion/actions.ts](app/(profile)/resenas/verificacion/actions.ts) — movido en mig 016):
- `confirmReview`: re-aplica la regla al cambiar a `counted`.
- `reassignReview`: idem + promueve la siguiente duplicada activa del cliente "huérfano" cuando se mueve el reviewId a otro cliente.
- `rejectReview`: si la rechazada era principal con duplicadas activas, promueve la siguiente más antigua a principal (sin esto, todas quedarían como duplicadas y nadie cuenta).

**Decisión consciente**: `markReviewRemoved` / `restoreReview` NO tocan `is_duplicate`. Si el admin elimina manualmente la principal, las duplicadas siguen siendo duplicadas (el filtro de KPI ya excluye `removed_at NOT NULL`). Coherente con la naturaleza ortogonal del soft-delete.

**Listados (todos muestran el badge)**:
- `/panel/resenas`, `/manager/resenas`, `/resenas/verificacion`, `/comerciales/[slug]`, `/clientes/[slug]`.
- `/manager/resenas` añade filtro "Duplicadas" (Mezcla / Solo principales / Solo duplicadas) propagado al export Excel.

**KPIs (todos filtran `is_duplicate=false`)**:
- [lib/leaderboard.ts](lib/leaderboard.ts), [app/(admin)/dashboard/page.tsx](app/(admin)/dashboard/page.tsx), [app/(admin)/comerciales/[slug]/page.tsx](app/(admin)/comerciales/[slug]/page.tsx), [app/(sales)/panel/page.tsx](app/(sales)/panel/page.tsx), [app/(sales)/panel/resenas/page.tsx](app/(sales)/panel/resenas/page.tsx), [lib/reports/weekly-report.ts](lib/reports/weekly-report.ts).
- Excel del gestor gana columna **"Duplicada"** + fila al pie "Total filas: X · Computables: Y · Duplicadas: Z".

**Componente UI**: [components/ui/DuplicateBadge.tsx](components/ui/DuplicateBadge.tsx) (pill ámbar con tooltip explicativo).

**Tests** ([lib/cron/__tests__/duplicate-detection.test.ts](lib/cron/__tests__/duplicate-detection.test.ts)): 8 escenarios del helper puro `decideFromPrincipals` (incluye orden cronológico, inversión Places API, empate, estado inconsistente).

### 4.24 Verificación de reseñas accesible a los 4 roles (mig 016)

La pantalla `/resenas/verificacion` vivía en `app/(admin)/resenas/verificacion/` y solo admin + office_director podían entrar. Tras mig 016 está abierta a los 4 roles con permisos acotados:

| Rol | Lectura | Acciones |
|-----|---------|----------|
| **admin** | Todo | confirm / reject / reassign / markRemoved / restore |
| **reviews_manager** | Todo (paridad admin) | Igual que admin |
| **office_director** | Counted/pending de SU equipo (mig 013) + unmatched de SU location (mig 016) | confirm / reject / reassign dentro del equipo / markRemoved / restore |
| **sales** | Counted suyas (mig 002) + unmatched de SU location (mig 016) | **Solo "Reclamar"** (unmatched → counted con `sales_id = self` + un client_id propio o crear cliente nuevo inline). No puede reasignar a otros, rechazar ni eliminar. |

**Implementación**:
- Carpeta movida de `(admin)/` a `(profile)/resenas/verificacion/` — el layout `(profile)` ya pinta el sidebar correcto para cada rol y la MobileTabBar de sales/director. URL `/resenas/verificacion` no cambia (route groups invisibles).
- `lib/auth/verification-gating.ts` expone función pura `canPerformAction(role, action)` + `claimReviewSchema` (Zod XOR clientId/newClientName). Testado en `lib/auth/__tests__/verification-gating.test.ts` (14 tests).
- `lib/auth/role-scope.ts::getRoleScope(supabase)` lee role + location_id del auth.uid() — primer uso real en la página de verificación (defensa en profundidad para filtrar `salesOptions` según rol viewer).
- Nueva server action `claimReview` específica para sales — reutiliza `createClientRecord` (existente en `app/(sales)/clientes/actions.ts`), aplica anti-fraude (mig 015) y deja audit log con `action='claim'`. Race-safe: el UPDATE con `.is("sales_id", null)` + RLS `reviews_sales_claim_update` WITH CHECK bloquea reclamaciones concurrentes.
- `ReviewVerificationRow.tsx` se ramifica entre `<SalesRow>` (panel "Es mía" con dropdown de clientes propios + "+ Nuevo cliente" inline) y `<FullRow>` (UX original para admin/manager/director).
- Sidebar: `SALES_SIDEBAR_GROUPS` ganó grupo "Reseñas" con item Verificación. `MANAGER_SIDEBAR_GROUPS` lo añadió entre Comerciales y Reseñas. `OFFICE_DIRECTOR_SIDEBAR_GROUPS` ya lo tenía.

**UX dedicada por rol en `page.tsx`** (commit `0303323`):
- **Default state**: sales entra a `?state=unmatched` (huérfanas de su ficha); el resto entra a `?state=pending`. El sales nunca tiene pending propias relevantes, así que arrancar ahí le mostraba pantalla vacía y daba la impresión de "estoy en el panel del admin".
- **Pestañas ocultas para sales**: no se renderizan las 3 chips de filtro (Pendientes / Sin atribuir / Eliminadas). El sales solo trabaja con huérfanas, así que ocultarlas evita ruido. Los otros 3 roles las siguen viendo.
- **Copy del Topbar y de la card "Cómo usar esta bandeja"** se ramifica según `isSalesViewer`:
  - sales → subtitle "Reseñas huérfanas de tu ficha" + explicación de qué son las huérfanas y cómo reclamar.
  - resto → subtitle "Bandeja de matching dudoso" + copy original sobre matcher con confianza intermedia.
- **Empty state** también ramificado: "Nada que reclamar" / "Sin huérfanas en tu ficha" para sales, sin link cruzado a otras pestañas que él no tiene.

**Patrón mixto cookie/service-client en `actions.ts`** (decisión consciente):
- **sales (claim)** → cookie-client + RLS `reviews_sales_claim_update` WITH CHECK como garantía dura.
- **admin / reviews_manager** → cookie-client + RLS amplia (mig 002/005).
- **office_director** → service-client (`createServiceClient`) porque mig 013 limita su RLS UPDATE a `sales_id IN team` y no cubre los movimientos sobre unmatched (mig 016 abre solo SELECT para director, no UPDATE). El gating en código (`canPerformAction` + `assertReviewInScope`) es la autoridad para director.

⚠️ **Propiedad del cliente en claim/reassign** (auditoría 2026-06-01): la RLS fuerza `sales_id` pero NO restringe `client_id`. Por eso `claimReview` y `reassignReview` validan en código con `clientBelongsToSales(clientId, salesId)` que el cliente pertenezca al comercial destino (sin esto, un sales con un POST manipulado podía atribuir una reseña a un cliente de otro comercial y, vía anti-fraude, degradar la principal del otro). La rama de cliente nuevo es segura (`createClientRecord` fuerza `sales_id = self`).

⚠️ **No pasar todas las acciones a service-client** "por simplicidad" — perderíamos la red de seguridad RLS para sales. El WITH CHECK de `reviews_sales_claim_update` es lo único que impide que un sales con código malicioso/bug se atribuya reseñas que no son suyas. Si en el futuro hace falta uniformar, primero diseñar policies UPDATE permissivas para director sobre unmatched y luego sí.

### 4.25 Link a ficha pública de Google en cada reseña

Cada listado de reseñas tiene un mini-link "Ver en Google" (icono `ExternalLink` con borde) que abre en nueva pestaña el **panel de reseñas de la ficha en Google** (`https://search.google.com/local/reviews?placeid=XXX`). Útil para verificar contexto, ver si tiene respuesta del propietario, o leer el texto en formato Google.

**Por qué este endpoint y no Google Maps**: Probamos también `https://www.google.com/maps/place/?q=place_id:XXX` (el patrón canónico documentado de Google), pero ese URL abre la ficha en Maps **sin la pestaña reseñas activa** — el usuario tiene que pulsar "Reseñas" manualmente. El URL ideal (Maps con reseñas ya abiertas) requiere el formato propietario `/data=...!9m1!1b1...` con el **FID interno de Google** (`0xd4229bf...`), NO el `place_id` estándar (`ChIJ...`) que guardamos en BD. Por eso usamos `search.google.com/local/reviews` que abre directamente el panel de reseñas — aunque sea en formato Google Search (no Maps), el usuario llega de un click a las reseñas.

**Limitación actual conocida**: con Places API no podemos hacer deep-link a la reseña concreta (no devuelve `reviewId` raw — lo sintetizamos con prefijo `places:`, ver §4.17). El usuario ve la lista completa de reseñas de la ficha y localiza la suya visualmente por autor + fecha. Cuando Google apruebe Business Profile API (caso 5-5855000041022, ETA junio 2026) el `reviewId` raw permitirá deep-link exacto.

**Pantallas con el link** (las 5 que muestran reseñas):
- `/manager/resenas` — columna nueva "Google" entre "Autor/valoración" y "Comercial/cliente" (grid 5→6 cols).
- `/resenas/verificacion` — junto al pill de estado en cada card (ReviewVerificationRow).
- `/panel/resenas` — junto al pill de match en cada card del sales.
- `/comerciales/[slug]` — en el footer de cada review card.
- `/clientes/[slug]` — en el footer de cada review card.

**Helper puro** [lib/google/review-url.ts](lib/google/review-url.ts): `buildGoogleReviewListUrl(placeId)` devuelve la URL o `null` si no hay place_id. Tests en [lib/google/__tests__/review-url.test.ts](lib/google/__tests__/review-url.test.ts) (5 tests).

**Componente compartido** [components/ui/GoogleReviewLink.tsx](components/ui/GoogleReviewLink.tsx): server-component-safe (no hooks), 2 variantes `compact` (solo icono) y `default` (icono + texto). Devuelve `null` si no hay placeId — caso defensivo, las 7 fichas de prod lo tienen.

⚠️ **NO confundir con** `buildGoogleReviewUrl` de [lib/landing.ts](lib/landing.ts) — ese construye URL para **escribir reseña** (`/local/writereview`), distinta de la URL para **verlas** (`/local/reviews`).

**Pendiente cuando llegue Business Profile**: ampliar el helper a `buildGoogleReviewUrl(placeId, googleReviewId, source)` y switchear entre URL a lista (Places) y URL a reseña concreta (Business Profile). El call site no cambia — se sigue pasando `placeId` desde el componente, simplemente añadimos `googleReviewId` y `source` desde la review. Ver §4.26.

### 4.26 Checklist completo "Cuando llegue Business Profile API"

> # ✅ CUOTA CONCEDIDA Y ACTIVADA — 2026-06-10
> Google aprobó el caso `5-5855000041022`. **Business Profile es ya la fuente ÚNICA de reseñas, going-forward.** Resumen de la activación (commits `3aaa6bd`, `f3e526f`, `c4d7549`; ver §4.50):
> - **7 fichas conectadas** por OAuth (cuenta `accounts/111197444117937021993`), 200 en v4 reviews. Bug del resource arreglado: `linkGoogleLocation` compone `accounts/X/locations/Y` (la v4 lo exige; antes guardaba `locations/Y` → 404) + backfill de las 7.
> - **"Solo de ahora en adelante"** (decisión de negocio): corte `BP_GO_LIVE_AT="2026-06-10T00:00:00Z"` en el cron BP → NO se importa histórico (Oropesa tiene 1.622) → **cero email-storm de alertas ≤2★** + bandeja limpia. (Deroga el plan de "backfill profundo" del Bloque A 4.b — ya NO aplica.)
> - **Fuente única BP**: Places apagado. `vercel.json` cron diario → `sync-google-reviews`; GitHub Action horaria repuntada a BP (`sync-reviews-hourly.yml`). Sin duplicados (Bloque B/D resueltos por diseño; quedaron 2 clones transitorios de Places del 05:00, deduplicados a mano).
> - **Bloque G (respuestas por API) ✅**: botón "Publicar en Google" en `/resenas/respuestas` para reseñas BP (§4.48 + §4.50).
> - **PENDIENTE (no hecho a propósito)**: deep-link a reseña concreta (Bloque C punto 7) — Google no expone URL pública por reviewId, se queda "Ver reseña" a la lista. ~~Soft-delete automático (Bloque C punto 6)~~ → ✅ reactivado el 2026-06-11 (mig 028, capa `missing_since` + umbral 24h, ver §4.20).
>
> El histórico de abajo se conserva como registro de cómo se consiguió la cuota. Lo accionable vivo está en §4.50.

> **Caso en Google**: `5-5855000041022`. ETA original ~2026-06-04. **Verificado el 2026-06-04 que sigue a cuota 0** (OAuth E2E funciona y guarda token, pero `listAccounts` → `429 RESOURCE_EXHAUSTED` con `quota_limit_value: "0"`).
>
> **🔑 CAUSA RAÍZ encontrada el 2026-06-09 (no era "esperar", era RECHAZO):** el correo de `socialmedia.inseryal@gmail.com` tenía la respuesta de Google al allowlist anterior — **RECHAZADO** porque el dominio de la web del formulario no coincidía con el del correo solicitante (se envió con un `@gmail.com`). El allowlist de la Business Profile API es **por PROYECTO de Google Cloud (`628454280082`), NO por ficha**, y SOLO Google lo concede a mano vía el formulario `support.google.com/business/contact/api_default` (revisión 7-10 días hábiles). **NO hay ajuste en Cloud Console que suba la cuota** — IAM / usuarios de prueba del OAuth NO cuentan.
>
> **Acción 2026-06-09 — allowlist REENVIADO bien:** se crearon **cuentas de Google con email de empresa** (opción "usar mi dirección actual" en accounts.google.com/signup — gratis, NO es Workspace; esos correos se leen en Outlook, no son Google nativos) y se reenviaron dos solicitudes con dominios que **coinciden**: `@inseryal.es`+web `inseryal.es` y `@marinadorconstrucciones.com`+web `marinadorconstrucciones.com`, **ambas al proyecto `628454280082`** (una aprobación desbloquea las 7 fichas). Caso anterior fallido por gmail: `4-2768000041441`. **A esperar 7-10 días hábiles (≈ hacia 2026-06-23).**
>
> **Re-check programado el 2026-06-23** (routine remota `trig_01LnriLHvqFNWmjTv2xnj3MP` — solo recordatorio: el agente remoto NO puede correr el script por falta de secretos). *Routine DESACTIVADA el 2026-06-11: la cuota llegó antes (2026-06-10), el recordatorio ya no aplicaba.* **Señal de que llegó**: abrir `/fichas/[id]/conectar` y ver el SELECTOR de fichas en vez del 429 (o `node scripts/check-bp-quota.mjs` en local, script gitignored). Si pasados >10 días hábiles sigue a 429, responder al hilo del caso para dar un toque.
>
> Esta sección es el **índice central** de todo lo que hay que tocar cuando Google apruebe la cuota. El resto del CLAUDE.md y la spec referencian aquí. Los archivos de código tienen comentarios locales que apuntan a esta sección.

**Estado de partida**: las 7 fichas tienen `google_place_id` configurado y sincronizan vía Places API (legacy + `reviews_sort=newest`, top-5 más recientes por ficha, cron horario GitHub Action). `oauth_status='disconnected'` en todas. El código del cron Business Profile y el OAuth flow están listos y testeados — solo esperan que la API devuelva 200 en lugar de 429 RESOURCE_EXHAUSTED.

#### Bloque A — Activación (orden estricto)

1. **Probar OAuth E2E primero** (1 ficha). Conectar desde `/fichas/[id]/conectar`. Verificar que `listAccounts` → `listLocations` → `listReviews` devuelven 200. Si Google sigue rechazando, abrir caso de seguimiento (no activar producción aún).
2. **Conectar las 7 fichas vía OAuth desde `/fichas`** en prod. El redirect URI de prod (`https://resenas.marinadorconstrucciones.com/api/google/oauth/callback`) ya está añadido en Google Cloud Console.
3. **Verificar que el cron Business Profile** (`/api/cron/sync-google-reviews`, schedule `5 5 * * *` UTC en vercel.json) corre la noche siguiente y mete filas con `source='business_profile'`. Mirar `audit_log` para entries del cron + revisar en `/manager/resenas` filtro `Estado matching: Atribuidas`.
4. **Pill "Business Profile" en dashboard y `/fichas`** cambia sola sin tocar código (lógica en §4.21). Confirmar visualmente.
4.b. ⚠️ **Truncado del primer sync (hallazgo auditoría, §4.37 H3)**: el cron BP (`sync-google-reviews/route.ts`) hace early-exit por página + `MAX_PAGES=10` (500 reseñas). En la PRIMERA sincronización de una ficha con histórico profundo (>500 reseñas) **se perdería el tail** y los re-runs posteriores no lo recuperan (vuelven a salir pronto). Antes de conectar fichas con mucho histórico: hacer un backfill que pagine a fondo (subir `MAX_PAGES` temporalmente o un script one-shot) y marcar la ficha como "backfill completo". Solo afecta a la carga inicial; el régimen estable (top recientes) está bien.

#### Bloque B — Limpieza de duplicados (one-shot)

Cuando Business Profile traiga la primera reseña que también vino por Places, tendremos clones (mismos `author_name + rating + google_created_at±1h`, distintos `google_review_id` porque Places usa prefijo `places:...` sintético y Business Profile el `reviewId` raw). El `unique (location_id, google_review_id)` no detecta esto porque los IDs son distintos.

5. **Script SQL de dedup one-shot**. Validar antes de correr (ver count primero). El borrado prioriza `business_profile` como autoritativo:
   ```sql
   -- COUNT primero para verificar
   select count(*)
   from reviews places, reviews biz
   where places.source = 'places_api'
     and biz.source = 'business_profile'
     and places.location_id = biz.location_id
     and places.author_name = biz.author_name
     and places.rating = biz.rating
     and abs(extract(epoch from (places.google_created_at - biz.google_created_at))) < 3600;

   -- Si el count cuadra con lo esperado, borrar
   delete from reviews places
   using reviews biz
   where places.source = 'places_api'
     and biz.source = 'business_profile'
     and places.location_id = biz.location_id
     and places.author_name = biz.author_name
     and places.rating = biz.rating
     and abs(extract(epoch from (places.google_created_at - biz.google_created_at))) < 3600;
   ```
   ⚠️ Importante: este script borra `places_api` y deja `business_profile`. Si `business_profile` tiene `match_state='counted'` y la versión `places_api` tenía `match_state='unmatched'`, perdemos la atribución manual que se hizo sobre la `places_api`. Antes de borrar, considerar **migrar `sales_id`, `client_id`, `match_state`** desde el clone `places_api` a la versión `business_profile` cuando este último esté unmatched.

#### Bloque C — Reactivar features desactivadas por limitaciones de Places API

6. **Detección automática de soft-delete** (§4.20). Hoy desactivada porque Places API no es consistente entre llamadas (mismo place_id devuelve sets ligeramente distintos por turno de frontal Google). Business Profile sí pagina y es autoritativo. Reactivar la llamada a `reconcileRemoved` en [lib/google/sync-places.ts](lib/google/sync-places.ts) (función ya existe, exportada como `__test_reconcileRemoved`) — pero **solo desde el cron Business Profile**, no el de Places. Considerar capa `last_seen_at` con threshold de N runs antes de marcar como `removed_at`.
7. **Deep-link a reseña concreta** en [lib/google/review-url.ts](lib/google/review-url.ts) (§4.25). Ampliar firma:
   ```ts
   export function buildGoogleReviewUrl(
     placeId: string | null | undefined,
     googleReviewId: string | null | undefined,
     source: "business_profile" | "places_api" | "manual",
   ): string | null
   ```
   Lógica: si `source === 'business_profile'` y ambos IDs están, devolver deep-link `https://www.google.com/maps/reviews?placeid=PLACEID&review_id=REVIEWID` (probar formato exacto — Google a veces usa `?reviewid=` con diferente casing). Si `source === 'places_api'`, devolver la URL actual (lista de reseñas, sin deep-link). Las 5 pantallas que usan `<GoogleReviewLink>` (§4.25) seguirán llamando al mismo helper pero ahora pasando también `googleReviewId` y `source` desde la review.
8. **Modo `anonymous_author` del matcher** (fase 4): Business Profile devuelve displayName real, el modo anonymous deja de aplicarse automáticamente. **No es trabajo a hacer** — solo observación: revisar `audit_log` action='anonymous_match_pending' a las 2 semanas y comprobar que ya no entran nuevos.

#### Bloque D — Estrategia de los dos crons

Hoy corren ambos crons en paralelo (`0 5 * * *` Places + `5 5 * * *` Business Profile, 5 min margen, lock optimista compartido). Cuando Business Profile esté activo y trayendo todo:

9. **Decisión a tomar**: ¿desactivar el cron Places API o dejarlo como redundancia?
   - **Desactivarlo** (recomendado a medio plazo): un solo cron, ahorra el GitHub Action horario, simplifica. La paginación de Business Profile cubre todo el histórico.
   - **Dejarlo como fallback** (recomendado al principio): si Business Profile vuelve a quedarse sin cuota, Places sigue trayendo top-5 recientes. Dos crons activos no se pisan (lock optimista de 60s).
   - Decisión: dejarlo activo el primer mes; tras 30 días sin incidencias, considerar desactivar Places. NO borrar el código de Places — solo borrar el cron de `vercel.json` y el workflow `.github/workflows/sync-places-hourly.yml`.

#### Bloque E — Cosas a actualizar en UI/docs

10. **Comentario empty state de `/manager/resenas`** (línea 355 aprox): "Cuando Google apruebe el acceso a la Business Profile API y el cron sincronice..." → actualizar a "Cuando entren reseñas nuevas..." (genérico).
11. **Comentario en `/comerciales/[slug]`** (línea ~612 aprox): "Cuando se conecte Google Business Profile (Fase 4 pendiente)..." → actualizar también.
12. **CLAUDE.md §3 (tabla de fases)**: marcar Fase 4 como ✅ (hoy está ⚠️).
13. **CLAUDE.md §7 (estado real Supabase)**: actualizar la línea "Todas tienen `google_place_id` y están sincronizando vía Places API. `oauth_status: disconnected` para Business Profile (esperando cuota Google)" — pasar a "Las 7 fichas conectadas vía OAuth Business Profile (mig N/A, OAuth en `location_secrets`). Pill 'Business Profile' (verde) en dashboard y `/fichas`."
14. **CLAUDE.md §8 Backlog v2**: marcar puntos 1, 2 y 3 como ✅ (estaban como pendientes para la activación).
15. **spec.md §3 (tech stack)**: "Google Places API (New) v1 + Business Profile API v1 + OAuth 2.0 (pendiente de cuota)" → quitar "pendiente de cuota".

#### Bloque F — Verificación del Verification de Google

16. **Consent screen en Testing → Production** en Google Cloud Console (§8 punto 3). Solo si hay testers externos al equipo actual. Si todo el equipo es `@inseryal.es` o `@marinadorconstrucciones.com`, mantener Testing está bien.

#### Bloque G — Activar publicación de respuestas por API (§4.48)

La bandeja `/resenas/respuestas` ya funciona en modo asistido (manual). Cuando llegue la cuota:

17. ✅ **Cablear `publishReviewReply`** (HECHO 2026-06-10, §4.48/§4.50): botón "Publicar en Google" cableado en `ReviewReplyComposer.tsx` (visible cuando `canPublishApi`), invoca `publishReviewReply` → `replyToReview`. Un clic guarda + publica.
18. ✅ **Sync del `reviewReply` en el cron BP** (HECHO 2026-06-10, §4.48): el cron detecta respuestas puestas directo en Google y las saca de "Sin responder" (`reply_via='google_detected'`). Caso A (fresca con reply → insert) + Caso B (`syncExistingReplies`, reseña existente que gana reply después, race-safe). Helper puro `normalizeOwnerReply` ([lib/google/owner-reply.ts](lib/google/owner-reply.ts)). NO pisa `api`/`manual`. (El gap de §4.41 "UPDATE si reviewId existe y cambió updateTime" para el CONTENIDO/rating editado se cerró el 2026-06-11 con `syncExistingEdits` — ver §4.41.)
19. **Deep-link a reseña concreta** (punto 7 de arriba): el "Abrir en Google" del composer pasará a deep-link exacto vía `buildGoogleReviewUrl(placeId, googleReviewId, source)`.
20. **Dedup (Bloque B)**: al migrar atribución del clone `places_api` al `business_profile`, migrar también `reply_text`/`replied_at`/`reply_via`/`reply_by`/`reply_synced_at` para no perder respuestas redactadas en el flujo asistido.

#### Cómo coordinar el rollout

- Crear branch `feat/business-profile-activation` ANTES de tocar producción.
- Hacer el bloque A en orden: si la primera ficha falla OAuth, no continuar con las otras 6.
- Bloque B (dedup) ejecutar **manualmente** vía Supabase Dashboard → SQL Editor. NO meterlo como migración (es one-shot, no idempotente).
- Bloque C-E pueden hacerse en commits separados después.

### 4.27 Exportación Excel — sidebar → `/comerciales` + Excel individual

Hasta v2 había un item "Exportar Excel" en el sidebar (admin + manager + director) que llevaba a `/manager/export`, además de un botón "Descargar Excel" en `/comerciales/[slug]` que en realidad descargaba el parte GLOBAL filtrado por sales_id (engañoso).

**Reorganización (2026-05-26)**:

- **Item del sidebar eliminado** de los 3 sidebars. La ruta `/manager/export` sigue existiendo (acceso por URL directa para filtros avanzados: ficha, match_state, etc.). El icono `Download` ya no se importa en `Sidebar.tsx`.
- **Card "Exportar resultados" en `/comerciales`** (entre stats y `SalesFilters`, oculta con `?archived=1`). Contiene un **`<RangePicker>`** (con los 3 atajos mes actual / mes pasado / último trimestre embebidos en el dropdown + form de rango libre) y un único botón "Descargar Excel" que usa el rango seleccionado. La URL acepta `?from=Y&to=Z`. Apunta al endpoint global `/api/export/reviews` (sin cambios). Link discreto a "exportación personalizada" → `/manager/export` para filtros avanzados (ficha, match_state).
- **Botón "Descargar Excel" en `/comerciales/[slug]`** ahora apunta al **endpoint nuevo** `/api/export/sales/[id]?from=Y&to=Z` que devuelve un Excel propio del comercial.

**Excel individual** ([lib/reports/sales-report.ts](lib/reports/sales-report.ts), endpoint en [app/api/export/sales/[id]/route.ts](app/api/export/sales/[id]/route.ts)):

- 1 sola hoja "Reseñas". Bloque cabecera (filas 3-7):
  - Comercial · Fecha incorporación (DD/MM/YYYY) · Zona ("Nacional (Pardiñas)") · Periodo · Total reseñas.
- Tabla (fila 9+): Fecha · Cliente · Autor · Valoración (`★★★★☆ (4)`) · Enlace.
- Columna Enlace: hyperlink Excel a `buildGoogleReviewListUrl(place_id)` (§4.25). Si la ficha no tiene place_id, muestra "—".
- **Reseñas incluidas**: solo `counted` + `is_duplicate=false` + `removed_at IS NULL` (KPI-grade, mig 015 anti-fraude aplicado). Si no hay nada en el rango, la tabla muestra "Sin reseñas atribuidas en este periodo.".

**Auth del nuevo endpoint** (defensa en profundidad además del middleware):
- admin / reviews_manager → cualquier `sales_id`.
- office_director → solo `self` o un sales con `director_id = self`. Si intenta exportar a alguien fuera de equipo: `403 forbidden_scope`.
- sales → solo `self` (autoservicio desde `/panel/resenas`, botón "Descargar Excel" en el Topbar). Si intenta exportar otro id: `403 forbidden_scope`. Middleware permite `/api/export/sales/*` para sales; el gating estricto vive en el endpoint.

**Reutilización**: ExcelJS dynamic import (igual que `/api/export/reviews`); `buildGoogleReviewListUrl` (§4.25); `parseRange` ([lib/date-range.ts](lib/date-range.ts)); `createServiceClient` para leer las reseñas (gating en código ya cubierto).

**Tests** ([lib/reports/__tests__/sales-report.test.ts](lib/reports/__tests__/sales-report.test.ts)): 18 unit tests de funciones puras (`formatJoinedAtForExcel`, `formatDepartmentForExcel`, `formatReviewDateForExcel`, `formatRatingForExcel`, `buildSalesReportFilename`). El Buffer del Excel no se testa (overkill — requiere abrir el binario).

⚠️ **NO confundir** con `weekly-report.ts` (parte GLOBAL con 4 hojas departamentales + Detalle). Son dos exports distintos: el global responde a "parte oficial de Raquel" y vive en `/api/export/reviews`; el individual responde a "auditoría de un comercial" y vive en `/api/export/sales/[id]`.

### 4.28 Sugerencia de vinculación de reseñas huérfanas al crear cliente

Caso real detectado en producción: la reseña de "Salvador Sanchis Plaus" apareció en el Excel de la comercial Judit sin nombre de cliente, aunque el cliente "salvador sanchis" sí existía en BD. Diagnóstico:

- La reseña llegó el 26-may 09:56 vía Places API.
- El cliente "salvador sanchis" se creó después (12:03), y su share_link se abrió a las 12:05.
- Cuando el cron metió la reseña, no había share_link de Salvador → el matcher la dejó `unmatched` (`reason: no_share_links_in_window`).
- Alguien la reclamó luego a Judit sin asignar cliente (`match_confidence: 0`).
- Cuando se creó el cliente, nadie hizo el vínculo.

Es un patrón legítimo: a veces el cliente deja la reseña **antes** de que el comercial le dé de alta en su CRM.

**Solución**: cuando un sales/director crea un cliente, el sistema busca reseñas `counted` del mismo sales con `client_id IS NULL` cuyo `author_name` se parezca al nombre del cliente. Desde 2026-06-02 hay **dos bandas** (ver el ⚠️ de abajo): las casi-exactas (≥90) se **vinculan solas**; las dudosas (50-89) se muestran en el modal `<OrphanReviewsModal>` con un botón "Vincular" por fila.

**Implementación**:
- Helper puro [lib/clients/orphan-reviews.ts](lib/clients/orphan-reviews.ts): `scoreOrphanCandidates(clientName, reviews, limit?)` reutiliza `nameSimilarity` del matcher; `partitionOrphanCandidates(scored)` divide en `autoLink` (≥`ORPHAN_AUTOLINK_THRESHOLD=90`) y `suggest` (`ORPHAN_SUGGEST_THRESHOLD=50`..89). Tests en [lib/clients/__tests__/orphan-reviews.test.ts](lib/clients/__tests__/orphan-reviews.test.ts).
- Server actions en [app/(sales)/clientes/actions.ts](app/(sales)/clientes/actions.ts): el núcleo `linkOrphanCore` (sin auth ni revalidación) lo comparten `linkOrphanReviewToClient` (vínculo manual del modal, audit `action='link_orphan'`) y `findOrphanReviewsForClient` (⚠️ **ahora ESCRIBE**: auto-vincula las ≥90, audit `action='link_orphan_auto'`, y devuelve `{ autoLinked, candidates }` con solo las dudosas). Auth: dueño del cliente (sales), director con scope al equipo, o admin/manager. Anti-fraude (mig 015) + race-safe (`.is("client_id", null)` en el WHERE) en ambos. ⚠️ **`findOrphanReviewsForClient` NO revalida `/clientes`** (se llama con el diálogo a punto de montarse → lo desmontaría, ver §4.33); el refresco de esa ruta lo hace el caller con `router.refresh()`.
- Componente [components/clients/OrphanReviewsModal.tsx](components/clients/OrphanReviewsModal.tsx): modal con lista de candidatas dudosas + prop opcional `autoLinkedCount` (banner verde "N se vincularon automáticamente"). Botón "Vincular" individual. Footer "Cerrar/Saltar". Tras vincular, refresh.

**Integración en 3 flujos** (todos consumen `{ autoLinked, candidates }`):
1. `NewClientButton` (en `/clientes`): tras `createClientRecord`, llama a `findOrphanReviewsForClient`. Las ≥90 ya se ataron solas; si quedan dudosas abre `OrphanReviewsModal` **antes** del `ClientLinkDialog`. Si todo fue auto-vínculo (o nada), pasa directo a compartir enlace (sin fricción).
2. `claimReview` (en `/resenas/verificacion`): cuando un sales reclama con `newClientName`, el row busca OTRAS huérfanas; auto-vincula las casi-exactas y abre el modal solo si quedan dudosas.
3. **Botón "Buscar reseñas" en cada fila de `/clientes`** ([ClientRowItem.tsx](app/(sales)/clientes/ClientRowItem.tsx)): vía a posteriori. Si solo hubo auto-vínculos → alert "Vinculé N automáticamente" + refresh. Si no hay nada → alert "No hay reseñas…". Si hay dudosas → abre el modal (con banner del auto-vínculo).

⚠️ **Dos umbrales**: `ORPHAN_SUGGEST_THRESHOLD=50` (mínimo para mostrar) y `ORPHAN_AUTOLINK_THRESHOLD=90` (mínimo para auto-vincular sin clic). Exacto (100) y "tokens del cliente contenidos en el autor" (90, p.ej. "Alba Aicart"="Alba Aicart" o "Salvador Sanchis" vs "Salvador Sanchis Plaus") → auto. Solo-nombre-de-pila (55, "Salvador López") o solo-apellido (30, "S. Sanchis") → al modal o nada.

⚠️ **Auto-vínculo de casi-exactas (≥90) ACTIVADO** (decisión 2026-06-02, deroga el "no auto-vincular sin confirmación humana" anterior). Las 50-89 siguen pidiendo clic. Si reaparecen falsos positivos en la banda ≥90, subir `ORPHAN_AUTOLINK_THRESHOLD` (p.ej. a 100 = solo exactos). Toda auto-vinculación deja traza `link_orphan_auto` en `audit_log` y es reversible (reasignar en verificación).

### 4.29 Alertas tempranas por reseñas ≤2★ (mig 017)

Cierra la open question #7 de [`spec.md`](spec.md). Cuando entra una reseña con `rating ≤ LOW_RATING_THRESHOLD` (=2 en producción: 1★ y 2★), el cron envía un email de alerta inmediata a múltiples stakeholders y se muestra un banner en `/dashboard`.

**Destinatarios** (función pura `resolveLowRatingRecipients` en [lib/cron/low-rating-alerts.ts](lib/cron/low-rating-alerts.ts), 18 tests):
- **Siempre**: admin + reviews_manager activos.
- **Si match_state ∈ {counted, pending}**: añadir sales atribuido (si email + status='active') y director responsable (si `sales.director_id` + status='active').
- **Si match_state = unmatched**: solo admin + manager (no hay sales identificable).
- Dedupe case-insensitive. El caso "director productor dual" cae natural (mismo email).
- Sales/director paused o archived → excluidos. Admins/managers paused → excluidos.

**Email** [lib/email/notify-low-rating.ts](lib/email/notify-low-rating.ts):
- Subject `⚠️ Reseña ${rating}★ recibida — ${locationName}`.
- Template HTML con borde naranja (`#f0d4a8`) y header destacado, escapeHtml aplicado.
- BCC para no exponer destinatarios entre sí (`sendEmail` de [lib/email/brevo.ts](lib/email/brevo.ts) ampliado con campo `bcc`).
- 2 CTAs: "Ir a verificación" (`/resenas/verificacion`) y "Ver en Google" (si hay place_id, vía `buildGoogleReviewListUrl`).

**Migración 017** [supabase/migrations/017_low_rating_alerts.sql](supabase/migrations/017_low_rating_alerts.sql):
- Añade `reviews.low_rating_alerted_at timestamptz` para idempotencia.
- Índice parcial `reviews_low_rating_pending_alert_idx` sólo sobre `rating <= 2 AND low_rating_alerted_at IS NULL` (subconjunto pequeño; la mayoría de reseñas son 4★/5★).
- Sin RLS adicional: solo el cron y service-client tocan esta columna.

**Idempotencia**: el cron solo procesa "fresh" (reseñas no insertadas previamente — `unique (location_id, google_review_id)`). Adicionalmente, `low_rating_alerted_at` se setea tras envío exitoso para evitar dobles alertas en casos extraños (p. ej. una reseña que pasa de unmatched → counted en una sincronización posterior; el INSERT no se repite y el campo timestamptz indica "ya alertada").

**Integración cron** ([lib/cron/process-reviews.ts](lib/cron/process-reviews.ts)):
- `processFreshReviews` ahora devuelve `{ notifications, lowRatingAlerts }` (cambio aditivo del shape de retorno).
- En el loop, tras insertar la review fresca, si `isLowRating(fr.rating)`, encola un `LowRatingAlert` con `reviewId`, `rating`, `matchState`, `placeId`, etc.
- `LocationCtx` ampliado con `place_id: string | null` (para el CTA del email).
- Nueva función `flushLowRatingAlerts` con patrón `Promise.allSettled` + audit_log. 3 acciones de audit: `low_rating_alerted` (ok), `low_rating_alert_failed`, `low_rating_alert_skipped` (no recipients o no brand).

**Crons que la disparan** (ambos):
- Cron Places API ([lib/google/sync-places.ts](lib/google/sync-places.ts)) — el activo hoy.
- Cron Business Profile ([app/api/cron/sync-google-reviews/route.ts](app/api/cron/sync-google-reviews/route.ts)) — cuando llegue cuota Google.
- Ampliamos ambos: cargan admins/managers/directors al inicio + flushean alertas al final.

**Banner en `/dashboard`** ([app/(admin)/dashboard/page.tsx](app/(admin)/dashboard/page.tsx)):
- Encima de la fila de KPIs. Solo se muestra si hay reseñas `rating <= 2` en el periodo activo.
- Cap a 5 entradas con autor + estrellas + ficha + fecha. Si hay más, "+ N más" + CTA "Ver todas →".
- Link CTA: `/manager/resenas?rating_lte=2`. Filtro añadido en `/manager/resenas`: `?rating_lte=N` con N ∈ {1..5} → `query.lte("rating", N)`.

**Open question #7 de spec.md cerrada** con esta implementación.

⚠️ **No confundir con `notifyNewReview`** (email transaccional al comercial atribuido, indep. del rating). Ambos pueden disparar a la vez: si entra una 1★ counted, el comercial recibe el email normal de "tienes nueva reseña" + el email de alerta ≤2★.

### 4.30 Visitas a enlaces — uso interno solo (decisión de producto 2026-05-26)

Decisión de negocio: las visitas a enlaces personales (`/c/{salesSlug}/{clientSlug}` → INSERT en `share_links`) **NO son un KPI accionable**. Una visita no es venta; el comercial puede tener 100 visitas y 5 reseñas y eso no cambia decisiones. Lo que importa es **reseñas counted no duplicadas** (anti-fraude mig 015 ya filtra).

**Cambios en UI** (commit consolidado tras esta decisión):

- **`/dashboard` (admin/manager)**:
  - KPI hero "Visitas a enlaces" eliminado → reemplazado por "Reseñas ≤2★ en el periodo" (más accionable, conecta con §4.29).
  - Chart "Visitas vs reseñas verificadas" simplificado a "Reseñas atribuidas · últimos 6 meses" (una sola serie). `AreaChart` ahora acepta `enviados?` opcional.
  - Card "Actividad · Visitas recientes a enlaces" **eliminada completa**.
  - GoalRow "Visitas registradas" eliminada de la card "Objetivos".
  - Footer card "Rendimiento por ficha" muestra ahora reseñas en lugar de visitas como número grande.
- **`/comerciales/[slug]`**: KPI "Visitas al enlace" + KPI "Conversión" eliminados. Quedan 2 KPIs en una fila: "Reseñas atribuidas" + "Valoración media". Columna "Visitas" de la tabla de clientes eliminada (grid 4 cols → 3 cols).
- **`/ranking`**: columna "Visitas" + "Conv." eliminadas de `<LeaderboardTable>`. StatCells "Visitas" + "Conversión" eliminadas de `<LeaderboardCardList>` (mobile). Sparkline ahora basado en `reviews` en lugar de `visits`. Sort secundario (desempate) cambia de `visits DESC` a `name ASC`. Texto de empty state y subtítulo ajustados.
- **`/manager/resenas`**: empty state reformulado para no mencionar "visitas a enlaces".

**Lo que NO se toca**:
- Tabla `share_links` (la usa el matcher para atribuir reseñas — sin esto no hay producto, ver §4.b matcher ventana 48h).
- Endpoint `/c/{salesSlug}/{clientSlug}` (sigue registrando visitas internamente).
- Pantallas del rol **sales**: `/clientes/[slug]` y `/panel/enlace` conservan visitas como info contextual ("¿este cliente abrió mi link?", "0 visitas hoy → comparte el enlace"). Útil para el comercial individual, no para management.
- Tipo `LeaderboardRow.visits` y `LeaderboardRow.conv` siguen calculándose en `lib/leaderboard.ts` (compatibilidad + uso futuro si se reactivara), solo dejan de mostrarse.

**Dedupe en backend** ([lib/landing.ts](lib/landing.ts), commit `1b750c5`): antes del INSERT en `share_links`, si existe ya una visita con `(sales_id, client_id, user_agent)` idénticos en los últimos 5 minutos, NO insertamos. El usuario sigue siendo redirigido a Google igual; solo evitamos inflar KPIs cuando el mismo navegador hace re-click (prefetch, vuelta atrás, comercial probando). Solo aplica cuando hay `client_id` + `user_agent` — visitas anónimas se cuentan tal cual.

⚠️ **Si en el futuro se quiere reactivar "Tasa de conversión" como KPI**, el campo `LeaderboardRow.conv` sigue existiendo. Solo hay que mostrarlo. Si se quiere mostrar visitas otra vez en un sitio concreto, idem.

### 4.31 Tres plantillas de mensaje por cliente + personalización por comercial (mig 019)

Hasta ahora el comercial compartía el enlace de un cliente con **una sola** plantilla (recién atendido tras la visita). Varios comerciales pidieron variantes según el perfil del cliente, porque usan el enlace también como herramienta para **reavivar visitas antiguas**. Además querían poder adaptar el texto **a su forma de hablar y que se guarde**.

**Modelo** ([lib/messaging.ts](lib/messaging.ts)):
- `MESSAGE_TEMPLATES: MessageTemplateDef[]` — 3 plantillas base, ids estables `post_visita` (la histórica = default) · `reavivar` · `breve`. Cada una tiene `label` (nombre base) + `build(brand)` (cuerpo con placeholders `{nombre_cliente}/{nombre_comercial}/{url}`). `post_visita.build === getDefaultReviewMessageTemplate` (no se duplica el texto).
- El comercial puede personalizar **nombre y/o cuerpo** de cada plantilla. `SavedTemplateEntry = { label?: string; body?: string }`; `SavedTemplates = Partial<Record<MessageTemplateId, SavedTemplateEntry>> | null` — shape de `profiles.message_templates`, p.ej. `{ "reavivar": { "label": "Cliente dormido", "body": "…{url}…" } }`.
- `resolveTemplate(id, brand, overrides)` → CUERPO: el del comercial si existe y no está en blanco, o el base. `resolveLabel(id, overrides)` → NOMBRE: el renombrado o el base. Nombre y cuerpo son independientes. Los overrides se guardan **con placeholders** (sin renderizar) y con la marca ya escrita.

**Alcance**: solo el enlace **por cliente** (`ShareBlock`). El enlace genérico (`/panel/enlace` → `LinkArsenalBlock`) mantiene su plantilla única (decisión de producto).

**Persistencia (mig 019)**: columna `profiles.message_templates jsonb` (nullable, shape anidado `{ [id]: { label?, body? } }`). Sin RLS nueva — la escritura es server-only vía service-client filtrando por `id = auth.uid()` (mismo patrón que el avatar). Añadida también a los tipos hand-maintained de [lib/supabase/types.ts](lib/supabase/types.ts) (`profiles.Row`/`Insert`).

**UI**:
- [ShareBlock.tsx](app/(sales)/clientes/ShareBlock.tsx): selector de 3 pestañas (pills) encima del textarea, **con el nombre que el comercial le haya puesto** (`resolveLabel`). Al elegir una, el textarea se rellena con `renderMessage(resolveTemplate(...))` (cuerpo del comercial o base) ya con nombre de cliente + URL. Los retoques manuales del textarea son **efímeros** (se pierden al cambiar de pestaña — aceptado). Link discreto "Editar mis plantillas →".
- Prop `templates?: SavedTemplates` threadeada: `clientes/page.tsx` y `clientes/[slug]/page.tsx` la cargan del perfil (`select` incluye `message_templates`) → `NewClientButton`/`ClientRowItem` → `ClientLinkDialog` → `ShareBlock`.
- Sección **"Mis plantillas"** [app/(sales)/panel/plantillas/](app/(sales)/panel/plantillas/): `page.tsx` (server, carga override + brand) + `MyTemplatesEditor.tsx` (client, edita **nombre (input) + cuerpo (textarea)** de las 3, con chips de comodines + "Restablecer a la original" por plantilla) + `actions.ts::saveMessageTemplates` (Zod: `label` opcional max 40, `body` opcional max 1000 y **si no vacío debe contener `{url}`**; campos en blanco → revierten a base; entrada vacía se omite; todo vacío → NULL; audit `update_message_templates`). Accesible vía link en `ShareBlock` y card en `/panel/enlace`, **ambos `m-hide-mobile` → la edición de plantillas es solo desktop** (decisión de producto; en mobile el comercial solo elige pestaña al compartir, no edita). El page `/panel/plantillas` sigue existiendo por URL pero sin acceso desde la UI mobile.

**Tests** ([lib/__tests__/messaging.test.ts](lib/__tests__/messaging.test.ts)): 3 ids en orden, `post_visita` base == default histórico, cada base con los 3 placeholders + marca correcta, `resolveTemplate` (body: override/blanco/id no coincidente) y `resolveLabel` (rename/blanco/independencia nombre-cuerpo).

⚠️ **El director productor no tiene `/clientes` ni `/panel/plantillas` propios** (usa layout admin/manager); la feature es del rol `sales`. La columna `message_templates` vive en `profiles` y serviría para director en el futuro, pero hoy no tiene editor.

### 4.33 No revalidar en `createClientRecord` — el diálogo de compartir se cerraba solo

`/clientes` renderiza el `NewClientButton` en dos sitios: el del Topbar (siempre montado) y otro **dentro del empty-state** (solo cuando `clients.length === 0`). El diálogo de compartir (`ClientLinkDialog`) y el `OrphanReviewsModal` viven como estado local de `NewClientButton`.

Bug (2026-06-01): al crear el **primer** cliente, `createClientRecord` hacía `revalidatePath("/clientes")`. La revalidación re-renderiza la página, que pasa del empty-state a la tabla → **desmonta el `NewClientButton` del empty-state** y, con él, el diálogo recién abierto → el diálogo "se cerraba solo".

Fix: `createClientRecord` **ya no revalida**. El refresco de la lista lo dispara `NewClientButton` con `router.refresh()` **al cerrar** el diálogo (`close()`, solo si se creó cliente), cuando ya no hay nada que desmontar. `claimReview` (que reutiliza `createClientRecord`) revalida `/clientes` por su cuenta, así que no se ve afectado.

⚠️ Si vuelves a añadir `revalidatePath` dentro de `createClientRecord`, el bug reaparece. Las server actions que abren/mantienen un modal en un componente que puede re-renderizarse condicionalmente no deben revalidar la misma ruta hasta que el modal se cierre.

### 4.32 Callout del objetivo en `/panel` — contenido en desktop, ancho completo en mobile

El callout motivacional del objetivo (`app/(sales)/panel/page.tsx`, ver §v2 panel-motivation) vive en la columna derecha del grid hero (`1.2fr 1fr`), dentro del flex `.m-ring-row`. En **desktop** el wrapper del callout lleva `maxWidth: 240` inline para no desbordar/superponerse en esa columna estrecha. En **mobile** el grid colapsa a una columna y queremos el callout a ancho completo: la clase `m-callout-wide` (globals.css, `@media max-width:767px`) hace `max-width: none !important`.

Historia: el commit `ab72777` quitó el `maxWidth: 240` para lograr el ancho completo en mobile, pero rompió desktop (se superponía). La solución correcta es la combinación de arriba — NO quitar el `maxWidth` inline. Un intento intermedio con `min-width: 0` en `.m-ring-row` no era la causa y se descartó.

### 4.34 Bloque "Histórico, ranking e insignias" del panel — insignias calculadas al vuelo

La card placeholder `<ComingSoon>` del fondo de `/panel` se sustituyó por la sección real con 4 widgets. Todos son **server-component-safe** y viven en [components/panel/](components/panel/): `MonthlyEvolutionCard`, `RecentReviewsCard`, `TeamRankSummary`, `BadgesCard`. La carga de datos vive en `loadPanelInsights()` dentro de [app/(sales)/panel/page.tsx](app/(sales)/panel/page.tsx) (un `Promise.all` paralelo a las queries del hero).

- **Barras de evolución**: `MonthBars` ([components/charts/MonthBars.tsx](components/charts/MonthBars.tsx)) con `bucketByMonth` — **extraído de `dashboard/page.tsx` a [lib/date-range.ts](lib/date-range.ts)** (ahora compartido por dashboard y panel). 6 meses, mes en curso resaltado. Reseñas verificadas (`counted`, no-duplicadas, no-eliminadas).
- **Últimas reseñas**: 5 más recientes `counted`. Reutiliza `Avatar`/`Stars`/`GoogleReviewLink`.
- **Posición en ranking**: `getLeaderboard({ teamFilter:{directorId}, currentUserId })` (mismo helper que `/panel/ranking`); `rankIndex = rows.findIndex(isSelf)`. Link al ranking completo.
- **Insignias**: ⚠️ **calculadas al vuelo, SIN tabla ni migración** (decisión de producto). Helper puro [lib/panel-badges.ts](lib/panel-badges.ts) (`computePanelBadges`, testeado en [lib/__tests__/panel-badges.test.ts](lib/__tests__/panel-badges.test.ts)). Cada insignia se deriva de datos ya cargados:
  - **Objetivo del mes** ← `reviewsThisPeriod >= monthly_goal`.
  - **En racha** ← meses consecutivos cumpliendo objetivo (`trailingStreak`, ignora el mes en curso si aún no llegó).
  - **Podio / Líder del equipo** ← `rankIndex` (solo si `teamSize > 1`).
  - **Hitos de volumen** (10/25/50/100) ← total histórico counted; muestra conseguidos + el siguiente.
  - **Coleccionista 5★** (10/25) ← total histórico de 5★.
  - Componente UI [components/ui/Badge.tsx](components/ui/Badge.tsx) (medalla, distinta del `Pill`): icono lucide en disco, estados `earned`/`locked`. `BadgesCard` ordena conseguidas primero.

  Si en el futuro se quiere fecha de desbloqueo o notificación al ganarlas, habría que persistir (tabla `achievements` + migración — "Ask first"). Hoy a propósito no se hace.

### 4.37 Auditoría enfocada del pipeline (crons/matching/OAuth/landing/Excel) — 2026-06-01

3ª ronda, sobre código crítico nunca auditado antes. Arreglado:
- **Inyección de fórmulas en Excel (HIGH)**: `author_name`/`text` vienen de Google (atacante puede poner su display name como `=HYPERLINK(...)`) y se escribían crudos en celdas → al abrir el .xlsx, ejecución de fórmula/DDE. Helper [lib/reports/excel-safe.ts](lib/reports/excel-safe.ts) `excelSafe()` (prefija `'` si empieza por `= + - @ \t \r`) aplicado en los SINKS de [/api/export/reviews](app/api/export/reviews/route.ts) (hoja Detalle) y [lib/reports/sales-report.ts](lib/reports/sales-report.ts). Tests en [lib/reports/__tests__/excel-safe.test.ts](lib/reports/__tests__/excel-safe.test.ts).
- **Cron — colisión de insert silenciosa (C2)**: si dos reseñas frescas colisionan en `unique(location_id, google_review_id)` (IDs sintéticos de anónimos en el mismo segundo) se perdían sin traza; ahora dejan `audit_log action='insert_collision'`.
- **Cron — fail-safe anti-doble-conteo (C1)**: si el INSERT de la nueva principal va bien pero el UPDATE que demota a la vieja falla, quedarían dos principales (infla comisión). Ahora se revierte la nueva a `is_duplicate=true` (sesgo a infra-contar) + `audit_log action='demote_failed_failsafe_duplicate'`.
- **Hardening**: `/api/sync/now` valida `location_id` como UUID; el callback OAuth ([api/google/oauth/callback](app/api/google/oauth/callback/route.ts)) reconfirma `getUser()` + rol/location (no solo la cookie state); `isPublicPath` ([lib/supabase/middleware.ts](lib/supabase/middleware.ts)) pasa a match por segmento exacto para `/login`,`/privacidad`,`/terminos`,`/accept-invite` (antes `/loginXYZ` colaba como público).
- **Test de regresión RLS** [lib/__tests__/rls-self-update.test.ts](lib/__tests__/rls-self-update.test.ts): lee la última migración de `profiles_self_update` y verifica que todas las columnas sensibles siguen congeladas (codifica §4.36).

**Diferidos (documentados, NO arreglados — latentes o de escala):**
- **H2 lock de 60s < runtime del cron**: si una ficha tarda >60s en procesarse, dos crons podrían solaparse. Hoy irrelevante (7 fichas, proceso <1s). Cuando crezca la escala: refrescar el lock o subir la ventana / usar advisory lock. Ver §4.15/§4.b.
- **H3 paginación Business Profile trunca el primer sync >500 reseñas**: el early-exit + `MAX_PAGES=10` puede dejar fuera el histórico profundo en la PRIMERA sincronización. **Latente: BP está a cuota 0.** Añadir a §4.26 (activación): primer sync paginando a fondo + flag "backfill completo". 
- **M2** reassign sin cliente deja una counted con `client_id=null` (cuenta en KPI, no dedupable) — decisión de semántica de producto, sin cambio.

### 4.35 Periodo de comisión (20→20) + tarifa €/reseña por productor (mig 020)

A los productores (sales + office_director) se les abona **comisión por cada reseña verificada**. El periodo de liquidación **no es el mes natural**: va del **día 20 (incluido) al día 19 del mes siguiente (incluido)** — el día 20 abre periodo nuevo, sin solapamientos. Es el rango protagonista en las pantallas del comercial.

**Fechas** ([lib/date-range.ts](lib/date-range.ts)): `commissionPeriodRange(now)`, `previousCommissionPeriodRange(now)`, `commissionShortcuts(now)` (periodo actual/anterior + mes natural/pasado) e `isCommissionPeriod(range, now)`. `parseRange(from, to, now, fallback)` ganó un 4º parámetro `fallback` (default `thisMonthRange`); las pantallas `(sales)` pasan `commissionPeriodRange`. Tests en [lib/__tests__/date-range.test.ts](lib/__tests__/date-range.test.ts) (bordes 19/20/21, cruce de año, contigüidad).

**Default range = periodo de comisión en TODA la app** (actualizado 2026-06-04, ver §4.43 — antes solo las pantallas del comercial; ahora también gestión). `parseRange(..., commissionPeriodRange)` + `commissionShortcuts(now)` (set único de 5 atajos: Periodo de comisión · Periodo anterior · Mes natural · Mes pasado · Último trimestre) en: [/panel](app/(sales)/panel/page.tsx), [/panel/resenas](app/(sales)/panel/resenas/page.tsx), [/panel/ranking](app/(sales)/panel/ranking/page.tsx), [/comerciales/[slug]](app/(admin)/comerciales/[slug]/page.tsx), `/dashboard`, `/ranking`, lista `/comerciales`, `/manager/resenas`, `/manager/export` (botón primario = comisión) y los endpoints de Excel (fallback comisión). El **mes natural / trimestre** sigue a un clic en el desplegable. `defaultShortcuts` queda sin uso.

**Abonable = solo `counted`** (no-duplicada, no-eliminada). `pending` se muestra como "potenciales" (se abonará al verificarse). El hero de `/panel` se reformuló: número grande = abonables, € estimado = `counted × commission_rate`, desglose con "por verificar" y "cierre en N días" (proyección recalculada sobre los límites reales del periodo, no fin de mes natural). KPIs de `/panel/resenas`: "Abonables (verificadas)" + "Por verificar" con € en el subtexto.

**Tarifa** (mig 020): columna `profiles.commission_rate numeric(8,2)` **nullable** (NULL = sin tarifa → UI muestra el aviso "consúltala con tu responsable" y oculta €). Se edita en la ficha del productor: comerciales en [comerciales/actions.ts](app/(admin)/comerciales/actions.ts) + `InviteSalesButton`/`SalesEditCard`; directores en [directores/actions.ts](app/(admin)/directores/actions.ts) + `InviteDirectorButton`/`DirectorEditCard`. Schema Zod `commissionRateSchema` (vacío→null, admite coma decimal, acota [0,9999]); se redefine en cada actions.ts porque "use server" no permite exportar el helper. Formato con `formatEuro` ([lib/utils.ts](lib/utils.ts)).

⚠️ La app **no** calcula/registra pagos reales ni liquidaciones; solo muestra el estimado para que el comercial vea su periodo. La conversión a nómina sigue siendo externa.

### 4.36 Blindaje de auto-edición de perfil + auditoría de tarifa (mig 021, auditoría 2026-06-01)

Hallazgo de la auditoría: la policy `profiles_self_update` (mig 002) solo comprobaba `id = auth.uid()` y que `role` no cambiara. **No restringía columnas**, así que cualquier usuario autenticado podía, llamando a PostgREST directamente con el JWT de su sesión (sin pasar por la server action), modificar SU PROPIA fila: `commission_rate` (fraude — el panel calcula € = counted × tarifa), `monthly_goal`, `status` (auto-reactivarse), `location_id`, `director_id` (cambiarse de equipo/ficha). El gating de las server actions (`assertCanManageSales`) no protege esto porque el ataque va directo a la BD.

- **Fix (mig 021)**: `WITH CHECK` que congela `role`/`slug`/`monthly_goal`/`commission_rate`/`location_id`/`director_id` (con `is not distinct from` contra el valor actual) y solo permite `status` `invited→active` (flip de `/auth/confirm`). Columnas no sensibles (full_name, phone, avatar_url, language, department, notes, paused_reason, email) siguen auto-editables. Admin/manager/director no se ven afectados (sus policies permisivas se evalúan en OR).
- **Regla nueva**: ⚠️ **al añadir una columna sensible/financiera a `profiles`, congelarla en `profiles_self_update` en la misma migración**. Es fácil olvidar el camino self-update razonando solo sobre las policies de admin/manager/director.
- **Auditoría**: `updateSales`/`updateDirector` registran `audit_log` con `action='update_commission_rate'` (la tarifa afecta a pagos; antes no dejaba traza).
- **Validación**: `commissionRateSchema` ahora **rechaza** entradas no vacías inválidas (antes las coaccionaba a `null`, borrando la tarifa en silencio). Vive en [lib/validation/sales-schemas.ts](lib/validation/sales-schemas.ts) (compartido entre comerciales/directores; junto con `departmentSchema`/`pauseReasonSchema`). Opciones de UI compartidas en [lib/constants.ts](lib/constants.ts); helpers de formato (fecha de reseña + match_state) en [lib/format.ts](lib/format.ts).

### Otros arreglos de la misma auditoría (sin migración)
- **Ranking del panel del comercial por reseñas VERIFICADAS** (no totales): `computeLeaderboard`/`getLeaderboard` aceptan `metric: "reviews" | "counted"` (default `"reviews"` para admin). `/panel/ranking` y la posición/insignias del panel usan `"counted"` para ser coherentes con la comisión. La `LeaderboardCardList` (solo `/panel/ranking`) muestra "Verificadas".
- **Rendimiento `/panel`**: `loadPanelInsights` ahora va dentro del mismo `Promise.all` que las queries del hero (antes serializado). `locations.find` en el leaderboard → `Map` (evita O(n·m)).
- **Límite defensivo `.limit(1000)`** en los listados de `/panel/resenas` y `/manager/resenas`.
- **Ring** protege `max=0` (objetivo 0 ya no pinta `NaN%`).

### 4.38 Atribución por mención del comercial en el texto (matcher)

**Problema**: en este negocio la relación es PERSONAL con el comercial, así que la reseña casi siempre lo nombra ("Tono es muy buen comercial"), mientras que el nombre del autor en Google rara vez coincide con el que el comercial dio de alta como cliente ("Maf" vs "Marta Ferrer"). El matcher solo miraba nombre-de-cliente + ventana temporal e ignoraba el texto → reseñas legítimas caían a `unmatched` ("colgando" en la bandeja).

**Solución** (en [lib/matching/attribute-review.ts](lib/matching/attribute-review.ts)): `attributeReview` es un wrapper en dos pasos. Tras la atribución normal (`primaryAttribution`), si NO ha dado ya un `counted` sólido (queda `pending` o `unmatched`), se intenta la **atribución por mención** (`attributeByCommercialMention`).

- ⚠️ **Decisión de producto (2026-06-02 — revisa la anterior anti-fraude)**: si el texto NOMBRA inequívocamente al comercial, BASTA para contar en automático (`counted`). Antes la mención solo subía a `pending`. Racional del negocio: la comisión es por **comercial × reseña**, y la mención resuelve justo el "a qué comercial"; el cliente exacto es secundario (lo afina el humano/comercial luego). La mención puede tanto rescatar un `unmatched` como **elevar a counted un `pending` por nombre débil** (caso de la captura: cliente "Marta Vallas" / autor "Marta Palenciano Cerro" → `name_score 55` → pending por nombre, pero el texto cita a "Jefferson" dueño del enlace → counted). Un match por nombre ya `counted` NO se toca.
- **Tier 1** — el comercial mencionado tiene enlace en ventana 48h: cuenta ese comercial + el cliente del mejor candidato (mayor `nameSimilarity`; desempate por cercanía temporal). `reason: 'counted_by_commercial_mention_in_window'`, confianza 85 (+5 si el nombre casa, +5 si ventana ≤4h, cap 98).
- **Tier 2** — el comercial mencionado NO tiene enlace en ventana pero está en el roster de la ficha: cuenta al comercial SIN cliente (la comisión es por comercial; el cliente lo afina el humano/comercial luego — ⚠️ una counted con `client_id=null` cuenta en KPI pero no es dedupable, ver §4.37 M2). `reason: 'counted_by_commercial_mention_no_window'`, confianza 78.
- **Ambigüedad (guardrail — corrección, NO criterio)**: si el texto menciona a >1 comercial distinto (en ventana o en roster), NO adivina → se queda con el resultado por nombre+tiempo (`pending`/`unmatched`). **Excepción: desempate comercial>director** (2026-06-10): si los mencionados son un COMERCIAL (`sales`) y uno o varios DIRECTORES (`office_director`), se atribuye al comercial (es quien produce; el director es supervisión — "nos curamos en salud"). Solo resuelve si queda EXACTAMENTE UN `sales`; con 0 ó ≥2 `sales` sigue siendo ambiguo → no cuenta. Helper `resolveMentionBySalesPreference`; evidencia marca `resolved_by_sales_preference: true`. Requiere `role` en `CommercialInfo` (ambos crons lo cargan). ⚠️ Trade-off aceptado: un director también es productor (vende directo), así que en algún caso real la reseña podría ser legítimamente suya → queda revisable en "Atribuidas".
- `mentionsCommercial(text, fullName)`: coincidencia por **token completo** (no substring; "Tono" no casa en "monótono"), ignora acentos/mayúsculas, casa nombre de pila **O cualquier apellido**, ignora tokens < 3 letras.

⚠️ **Implicación anti-fraude consciente**: como la mención cuenta sola, un comercial podría inducir a clientes a nombrarlo para auto-atribuirse reseñas. Se acepta: el anti-fraude de duplicados (mig 015) sigue capando varias reseñas por cliente, y este es el patrón legítimo del negocio. Si reaparecen falsos positivos, el lever es subir la exigencia de mención (p.ej. exigir también nombre de pila ≥55) o volver a `pending` para Tier 2.

**Cableado**: `ReviewInput` gana `text`; `ShareLinkCandidate` gana `sales_full_name`; `attributeReview` gana 3er parámetro opcional `commercials: CommercialInfo[]` (roster de la ficha). En [lib/cron/process-reviews.ts](lib/cron/process-reviews.ts) se enriquecen los candidatos con `sales_full_name` (desde `salesById`) y se pasa `text` + `commercials`. Ambos crons ([sync-places.ts](lib/google/sync-places.ts) y [sync-google-reviews/route.ts](app/api/cron/sync-google-reviews/route.ts)) añaden `location_id` a su query de `profiles` y construyen `commercialsByLocation` (sales + office_director NO archivados, por ficha). Sin migración ni cambio de BD.

**Tests** ([lib/matching/__tests__/attribute-review.test.ts](lib/matching/__tests__/attribute-review.test.ts)): Tier 1/Tier 2 cuentan en automático + elevación de pending a counted por mención (caso captura) + ambigüedad sigue sin contar + no-cuenta-sin-texto + no-degrada-counted.

⚠️ **La atribución de una reseña de Google a un cliente es heurística por construcción — no hay forma determinista.** Google es el dueño del dato: la reseña se escribe en SU formulario (nosotros solo hacemos 302 a la URL de "escribir reseña") y la API solo nos devuelve `reviewId · displayName · profilePhotoUrl · isAnonymous · starRating · comment · createTime · updateTime · reviewReply` (ver [business-profile.ts:283](lib/google/business-profile.ts#L283)). **Ningún campo es nuestro**: no podemos inyectar un código/parámetro que viaje al cliente y vuelva con la reseña (Google ignora cualquier querystring; no hay campo oculto). Evaluado y **descartado** (2026-06-01): (a) "código round-trip" — imposible; (b) página intermedia + alias del cliente — añade fricción sin aportar certeza nueva (sigue siendo la misma inferencia tiempo+identidad-del-clic). NO volver a proponer estas vías.

**Replanteamiento aceptado**: separar atribución al **comercial** (resoluble — la mención del texto + tiempo lo cubren; es lo que importa para la comisión, que es por reseña × comercial) de atribución al **cliente exacto** (imposible-determinista; solo importa para anti-fraude de duplicados y CRM del comercial → se resuelve en la confirmación humana o lo reconoce el propio comercial). **El único lever sin fricción y compatible con políticas de Google** para mejorar la heurística es el **copy del mensaje** que el comercial manda al cliente: orientarlo a que el cliente **nombre a su comercial** refuerza la señal de mención (§4.31 plantillas). ⚠️ NO hacer "review gating" (recoger la reseña first-party y reenviar solo las buenas a Google) — viola las políticas de Google y arriesga la ficha.

### 4.39 Transliteración cirílico→latino al crear/editar cliente

**Problema (detectado en prod 2026-06-03)**: un comercial intentó dar de alta un cliente de Europa del Este con nombre en cirílico (p.ej. "Марина Кудраўцава"). `slugify()` solo conservaba `[a-z0-9]`, así que un nombre 100% no-latino quedaba en cadena vacía → `createClientRecord` abortaba con "No se pudo generar el identificador del cliente" (guard de slug vacío) y NO se creaba ni cliente ni enlace. Síntoma reportado: "me deja escribir el nombre pero no se genera el enlace".

**Solución** (sin migración): nueva función pura [`transliterateCyrillic`](lib/utils.ts) (mapa cirílico→latino ruso+bielorruso+ucraniano, preserva caja `Ж→Zh`, deja intacto lo ya latino/acentos/ñ, ignora alfabetos no mapeados):
- Integrada **dentro de `slugify`** (antes del filtro `[^a-z0-9]`). Beneficia a TODOS los que generan slug por nombre: clientes, comerciales, gestores y directores (el dpto. internacional también tiene nombres cirílicos). "Марина Кудраўцава" → slug `marina-kudrautsava`.
- Aplicada también al **`full_name` guardado** del cliente en `createClientRecord` y `updateClient` ([app/(sales)/clientes/actions.ts](app/(sales)/clientes/actions.ts)), para que el comercial vea el nombre en latín en su lista/Excel y para que case mejor con el `author_name` de Google (que también viene transliterado). Los demás roles NO transliteran el nombre visible (lo teclea el admin, ya en latín); solo su slug.

⚠️ La transliteración automática puede no coincidir **al 100%** con la grafía exacta de Google en algún nombre; el comercial puede editar el `full_name` a mano después (el slug es estable tras crearse, no se rompe el enlace). Para alfabetos **no mapeados** (chino, árabe…) el slug sigue saliendo vacío y se muestra el error claro en vez de crear un enlace roto — si hace falta, ampliar el mapa o añadir fallback genérico.

**Tests** ([lib/__tests__/utils.test.ts](lib/__tests__/utils.test.ts)): 8 casos (transliteración con caja, signos blandos, latino/ñ intactos, alfabeto no mapeado, slug del caso real Kudrautsava).

### 4.40 Foto de perfil gestionada por admin/gestor/director

Hasta ahora la foto (avatar) era solo **self-service** desde `/perfil`. Ahora un gestor puede subir/cambiar/quitar la foto de otros productores:
- **Comercial** (`/comerciales/[slug]`): admin, reviews_manager y office_director. El director queda acotado a su equipo por la RLS de lectura (mig 013, solo ve el detalle de SU equipo) + `assertSalesInScope` en la acción.
- **Director** (`/directores/[slug]`): SOLO admin + reviews_manager (la página ya redirige a otros roles; el office_director NO toca la foto de otro director).

**Helper compartido** [lib/avatar.ts](lib/avatar.ts) (server-only, single source of truth del storage): `validateAvatarFile` (tipo PNG/JPG/WebP + máx 4 MB), `storeUserAvatar(targetId, file)` (sube a `${targetId}/avatar.${ext}` vía service-client + devuelve URL pública con cache-buster, NO toca `profiles`), `removeUserAvatarObjects(targetId)`. Lo consumen las 3 vías: [`(profile)/perfil/actions`](app/(profile)/perfil/actions.ts) (refactorizado, self), [`comerciales/actions`](app/(admin)/comerciales/actions.ts) (`uploadSalesAvatar`/`removeSalesAvatar`, role-guard `sales`) y [`directores/actions`](app/(admin)/directores/actions.ts) (`uploadDirectorAvatar`/`removeDirectorAvatar`, role-guard `office_director`). Las acciones de gestión usan **service-client + code-gating** y dejan `audit_log` (`update_avatar`/`remove_avatar`).

**UI**: componente cliente reutilizable [components/ui/AvatarUploader.tsx](components/ui/AvatarUploader.tsx) (Avatar + Subir/Cambiar/Quitar). Recibe las server actions **ya bindeadas** al usuario destino (`uploadSalesAvatar.bind(null, id)`), así el cliente solo manda el `File`. [`PhotoUpload`](app/(profile)/perfil/PhotoUpload.tsx) pasó a ser un wrapper fino sobre `AvatarUploader`. Las páginas de detalle añaden `avatar_url` al `select` y pintan el avatar interactivo (editable) o `<Avatar src>` read-only (productor-director o archivado).

⚠️ Sin migración ni cambio de BD (la columna `profiles.avatar_url` y el bucket `avatars` ya existían). El bucket es **público** (lectura sin auth), igual que con el self-service.

**Render de la foto en TODAS las superficies de listado** (2026-06-03): subir la foto no bastaba — los listados pintaban `<Avatar>` solo con iniciales (no seleccionaban `avatar_url` ni pasaban `src`). Corregido en: `/comerciales` (SalesRow), `/directores` (DirectorRow), `/directores/[slug]` (equipo), `/gestores` (ManagerRow), ranking `/ranking` + `/panel/ranking` (lib/leaderboard.ts gana `avatar_url`→`avatarUrl` en `LeaderboardSales`/`LeaderboardRow` + ambas queries; `LeaderboardTable`/`LeaderboardCardList` pasan `src`) y el top-10 del `/dashboard` (su query de productores). Regla: **cualquier listado nuevo de personas debe seleccionar `avatar_url` y pasar `src={...}` al `<Avatar>`** — si no, sale solo con iniciales aunque el usuario tenga foto.

### 4.41 Fusión por autor de ediciones de reseña (Places) — evita falsos duplicados

**Problema (caso real 2026-06-04, Cornel):** un cliente dejó **1★**, el comercial habló con él y **editó la misma reseña a 5★**. En Google sigue habiendo UNA reseña, pero la plataforma mostraba **dos filas** (1★ contada como principal + 5★ marcada duplicada por mig 015) → media y conteo irreales.

**Causa:** Places API legacy no da `reviewId` estable; sintetizamos `google_review_id = places:{place_id}_{unix_time}_{md5_8(autor)}` ([lib/google/places.ts](lib/google/places.ts)). Al editar, Google cambia el `time` → cambia el id sintético → el cron la trata como NUEVA e inserta otra fila. El anti-fraude por `client_id` (mig 015) deja como principal la más antigua → la stale 1★ cuenta.

**Hecho clave:** Google permite **una reseña por persona y negocio** → dos filas con el mismo `author_name` (no anónimo) en la misma `location_id` son la **misma** reseña editada.

**Solución (sin migración):** "fusión por autor" en [lib/cron/process-reviews.ts](lib/cron/process-reviews.ts) (`processFreshReviews`). Antes de `attributeReview`, **solo en el path `places_api`** y para autores no anónimos, busca incumbentes `places:%` con el mismo `author_name` en la ficha. Decisión en helper puro [lib/cron/edit-merge.ts](lib/cron/edit-merge.ts) `decideEditMerge` (tests en [lib/cron/__tests__/edit-merge.test.ts](lib/cron/__tests__/edit-merge.test.ts), 9 casos):
- exactamente 1 incumbente → **merge**: `UPDATE` esa fila con `google_review_id, rating, text, google_created_at, fetched_at` (limpia `removed_at` si lo tenía; limpia `low_rating_alerted_at` y re-encola alerta si la edición baja a ≤2★ por primera vez). **Preserva** `sales_id, client_id, match_state, is_duplicate, share_link_id, match_confidence, match_evidence` (conserva la atribución humana). NO inserta, NO corre attribution ni `decideDuplicateForClient`. `audit_log action='review_edit_merged'`; contador `summary.merged`.
- 0 incumbentes → insert normal. ≥2 (ambigüedad legacy) → insert normal (no adivina).

**Ortogonal a mig 015**: familia/amigos compartiendo un enlace dejan reseñas con `author_name` DISTINTOS → no se fusionan → siguen gestionadas por el anti-fraude de `client_id` (§4.23).

⚠️ **Casos límite (riesgo aceptado, documentado):** (a) **anónimos** no se fusionan (una edición anónima aún crearía fila fantasma, raro); (b) **homónimos** reales en la misma ficha → la 2ª se fusionaría con la 1ª (rarísimo; `review_edit_merged` lo hace auditable, se separa en Verificación); (c) un incumbente `unmatched` editado conserva `unmatched` (no re-atribuye).

✅ **Business Profile (gap cerrado 2026-06-11):** BP tiene `reviewId` estable → una edición mantiene el id → se filtra como no-fresh → no llega a `processFreshReviews`. Lo cubre `syncExistingEdits` en [lib/google/sync-business-profile.ts](lib/google/sync-business-profile.ts) (espejo de `syncExistingReplies`, corre ANTES del filtro fresh): prefiltra candidatas por `updateTime !== createTime` (Google lo bumpea al editar; las que solo ganaron respuesta caen a skip al comparar valores) y decide con el helper puro `decideBpEditSync` ([lib/cron/edit-merge.ts](lib/cron/edit-merge.ts), misma semántica que el merge de Places: solo actualiza `rating`/`text`/`fetched_at`, **preserva la atribución** (sales_id/client_id/match_state/is_duplicate), revive soft-deleted (`removed_at=null`), re-encola alerta ≤2★ si baja a low por primera vez, skip defensivo si el rating entrante no está en 1..5). Idempotente (tras el UPDATE el siguiente cron compara igual → skip). `audit_log action='review_edit_synced'`; contador `summary.edited`. Tests en [lib/cron/__tests__/edit-merge.test.ts](lib/cron/__tests__/edit-merge.test.ts). La fusión por autor sigue acotada a `places_api` y no cruza fuentes; las ediciones de reseñas históricas NO importadas (anteriores a `BP_GO_LIVE_AT`, no están en BD) se ignoran por diseño.

**Limpieza one-shot aplicada 2026-06-04** (service-role, count-first, `audit_log`): 4 grupos mismo-autor+ficha colapsados a 1 fila viva cada uno (la más reciente = principal counted; las viejas → `removed_at`): NURIA GARCIA BECERRA (5★ principal, 1★ removed → Cornel pasó de media 4,50 a 5,00), Marina Kudrautsava, Marta Fernandez llaneza, Peri Alesk. NO fue migración (one-shot, no idempotente).

### 4.42 Resumen productivo en la ficha del comercial (gestión) — alineada al periodo de comisión

Admin, reviews_manager y office_director ven en `/comerciales/[slug]` la **misma foto productiva** que el comercial ve en su `/panel`: abonables, € en comisión, objetivo (anillo), estrellas, "por verificar", cierre/días, comparativa "+N vs periodo anterior", evolución de 6 meses (barras), posición en el ranking del equipo e insignias. Antes solo había dos Stat pobres ("Reseñas atribuidas 0/5" + "Valoración media") en **mes natural**, lo que chocaba con lo que ve el comercial (incoherencia 8/100% vs 0/5).

**Cambio clave:** la ficha pasa a **periodo de comisión (20→19)** por defecto (`parseRange(..., commissionPeriodRange)` + `commissionShortcuts`), igual que el panel. Desde 2026-06-04 (§4.43) **TODA la app** arranca en periodo de comisión, así que ya no es una excepción. Las tablas de abajo (clientes, reseñas, Excel individual) siguen el rango del selector.

**Implementación (sin migración):** componente presentacional [components/panel/ProducerSummary.tsx](components/panel/ProducerSummary.tsx) — factual, copy en 3ª persona ("su equipo"), SIN los mensajes motivacionales del panel — que reutiliza las piezas puras `Ring`, `MonthBars`, `Badge`, `formatEuro` y `computePanelBadges`. La carga de datos vive en `loadProducerInsights(...)` dentro de [app/(admin)/comerciales/[slug]/page.tsx](app/(admin)/comerciales/[slug]/page.tsx), que espeja `loadPanelInsights` del panel pero parametrizada por el `sales_id` visto (corre con el cliente del viewer → RLS acota al director a su equipo; `getLeaderboard` con `teamFilter` usa service-role para el ranking). El € usa `commission_rate` (null → "sin tarifa"); abonables/€ cuadran con lo que ve el propio comercial. Verificado en navegador con Cornel (8 abonables, 100%, 160€, #1 líder) y Fidanka (0, empty states limpios).

⚠️ NO se extrajo la hero motivacional del panel (mantiene su copy de ánimo intacto). Si en el futuro se quiere unificar, `ProducerSummary` es el candidato a compartir.

### 4.43 Selector de fecha unificado a "Periodo de comisión" en toda la app

Antes el selector arrancaba en **periodo de comisión** solo en las pantallas del comercial; gestión arrancaba en **mes natural** (decisión original de §4.35). Decisión de producto (2026-06-04): **toda la app arranca en periodo de comisión (20→19)**, con el resto de rangos a un clic. Da coherencia (el gestor ve lo mismo que el comercial y que cuadra con la liquidación).

- **Set único de atajos:** `commissionShortcuts(now)` ([lib/date-range.ts](lib/date-range.ts)) ahora devuelve **5** entradas — Periodo de comisión · Periodo anterior · Mes natural · Mes pasado · **Último trimestre** (este último se añadió para no perder la auditoría trimestral de gestión). Es el ÚNICO set de la app; `defaultShortcuts` queda sin uso (no se borra).
- **Pantallas migradas** (fallback `commissionPeriodRange` + `commissionShortcuts`): `/dashboard`, `/ranking`, lista `/comerciales` (card de export), `/manager/resenas`. Ya estaban: `/panel*` y `/comerciales/[slug]`.
- **`/manager/export`** (parte oficial, usa botones no RangePicker): el botón **primario** pasa a "Periodo de comisión" + se añade "Periodo anterior"; se mantienen "Mes actual/Mes pasado/Último trimestre"; el formulario personalizado arranca en el periodo de comisión. El parte mensual sigue a un clic.
- **Endpoints Excel** ([/api/export/reviews](app/api/export/reviews/route.ts), [/api/export/sales/[id]](app/api/export/sales/[id]/route.ts)): `parseRange` fallback → `commissionPeriodRange` (solo afecta a llamadas sin params; los botones pasan rango explícito).

⚠️ El dashboard solo pinta el **% de objetivo al 100%** cuando el rango es un mes natural (`isMonthRange`); en periodo de comisión muestra el conteo + el aviso "selecciona un mes natural para verlos al 100%" (degradación intencional, no roto). Sin migración.

### 4.44 Edición del perfil de gestores por el admin

Hasta ahora `/gestores` era solo lista (invitar + reenviar acceso + eliminar). Ahora el **admin** puede **editar** el perfil de un gestor (`role='reviews_manager'`) desde un botón "Editar" por fila que abre un modal ([app/(admin)/gestores/ManagerEditButton.tsx](app/(admin)/gestores/ManagerEditButton.tsx)).

- **Campos editables:** nombre, teléfono, estado (activo/pausado) y **foto**. El **email es read-only** (es el acceso/login; cambiarlo desincronizaría auth → para eso, reinvitar). El estado no se edita si el gestor está `invited` (la transición invited→active la hace el login).
- **Acciones** en [app/(admin)/gestores/actions.ts](app/(admin)/gestores/actions.ts): `updateReviewsManager` (cookie-client; la RLS `profiles_admin_all` de mig 002 ya permite al admin el UPDATE; `.eq("role","reviews_manager")` como defensa) + `uploadManagerAvatar`/`removeManagerAvatar` (reutilizan el helper [lib/avatar.ts](lib/avatar.ts) y el componente [AvatarUploader](components/ui/AvatarUploader.tsx), igual que comerciales/directores en §4.40). Todas gated por `assertAdmin()` (solo admin global, no otro gestor) y con `audit_log` (`update_manager`/`update_avatar`/`remove_avatar`).
- **Sin migración** (la columna `avatar_url` y el bucket `avatars` ya existían; `profiles_admin_all` ya cubría el UPDATE). Verificado en navegador (editar Bel: foto + nombre + teléfono + estado, guardado OK).

⚠️ Es **solo-admin** por decisión: un gestor NO edita a otro gestor (no se añadió RLS para `reviews_manager`→`reviews_manager`). Si en el futuro se quiere, añadir una policy específica (ver nota en la exploración de §4.44).

### 4.45 Sistema de soporte interno (helpdesk) — mig 023

Helpdesk interno tipo Intercom. Los **productores** (sales + office_director) abren consultas cuando necesitan ayuda; los **respondedores** (admin + reviews_manager) las atienden. El director NO responde a consultas de su equipo — solo pregunta como un comercial más.

**Schema** (migración 023 [`supabase/migrations/023_support_helpdesk.sql`](supabase/migrations/023_support_helpdesk.sql)):
- `support_conversations` — subject, category (CHECK: `general`/`review_question`/`technical`/`billing`), status (`open`/`closed`), `opener_id`, vínculo opcional a `reviews.id` y `clients.id`, `last_message_at` denormalizado.
- `support_messages` — `conversation_id`, `author_id`, `body`, `created_at`. Append-only (no DELETE).
- `support_read_receipts` — PK `(user_id, conversation_id)`, `last_read_at`. UPSERT al abrir la conversación.
- Función SQL `support_unread_count()` (`SECURITY DEFINER`): LEFT JOIN conversations ↔ receipts, scoped por rol. Llamada via `supabase.rpc("support_unread_count")` desde los 4 layouts.

**RLS**:
- `support_conversations`: admin/reviews_manager → ALL; sales/office_director → solo `opener_id = auth.uid()`.
- `support_messages`: SELECT/INSERT via `EXISTS` contra conversations (hereda RLS). INSERT fuerza `author_id = auth.uid()`.
- `support_read_receipts`: `for all` → `user_id = auth.uid()`.

**Rutas**: vive en `app/(profile)/soporte/` (mismo grupo que `/ayuda`):
- `/soporte` — lista de conversaciones con badge no-leído, pills de categoría/estado, tiempo relativo.
- `/soporte/nueva` — formulario (subject + category + body + vincular reseña/cliente opcional).
- `/soporte/[id]` — hilo de mensajes con burbujas diferenciadas asker vs respondedor, composer, botón cerrar/reabrir. **Auto-refresh cada 15s** via [`<AutoRefresh>`](components/soporte/AutoRefresh.tsx) (`router.refresh()` periódico; sin WebSockets).

**Sidebar**: link "Soporte" con icono `MessageCircle` + badge azul de no-leídos en el footer del sidebar (entre la nav y "Ayuda"). El sidebar usa `height:100vh` + `position:sticky` + `overflow:hidden` para que el footer quede siempre visible, con scroll interno en el `<nav>` (`flex:1 + overflowY:auto`).

⚠️ **Para que el `position:sticky` del sidebar funcione**, [`Frame`](components/layout/Frame.tsx) **NO debe tener `overflow:hidden`** (se quitó el 2026-06-04): un `overflow != visible` convierte a Frame en contenedor de scroll y ancla el sticky a Frame (que no scrollea) en vez de al documento → el footer "subía" al hacer scroll. El scroll horizontal de contenido ancho lo absorbe cada bloque (tablas con `overflowX:auto`) + `minWidth:0` en los `<main>` de los 4 layouts. NO volver a añadir `overflow` a Frame.

**Email** ([`lib/email/notify-support.ts`](lib/email/notify-support.ts)):
- Nueva conversación / mensaje del opener → email a admin + reviews_manager activos (BCC).
- Mensaje del respondedor → email al opener.
- `getResponderEmails()` busca en `profiles.email` con fallback a `auth.users.email` (algunos admins tienen NULL en profiles).
- `getProfileEmail(userId)` helper con el mismo fallback para el email del opener.

**Fechas**: todas formateadas con `timeZone: "Europe/Madrid"` (Vercel corre en UTC).

**Componentes**: [`components/soporte/`](components/soporte/) — `ConversationRow`, `MessageBubble`, `CategoryPill`, `MessageComposer`, `ConversationActions`, `NewConversationForm`, `AutoRefresh`, `SupportHoursNotice`.

**Horario de atención (informativo, 2026-06-11)**: `/soporte` y `/soporte/nueva` muestran un aviso con el horario del equipo respondedor — septiembre–junio L-V 9:00–14:00 y 15:00–18:00; julio/agosto intensivo L-V 8:00–15:00. Solo se muestra el horario del mes en curso (decisión de producto). Helper puro [lib/support-hours.ts](lib/support-hours.ts) (`getSupportHoursNotice`, mes calculado en Europe/Madrid — Vercel corre en UTC), tests en [lib/__tests__/support-hours.test.ts](lib/__tests__/support-hours.test.ts). Es solo texto: no bloquea abrir consultas fuera de horario.

✅ **Mobile (cerrado 2026-06-11)**: el punto de entrada a Soporte/Ayuda en mobile es la tarjeta **"Ayuda y soporte"** en [`/perfil`](app/(profile)/perfil/page.tsx) (componente local `HelpLink`): links a `/soporte` (con badge azul de no-leídos vía `supabase.rpc("support_unread_count")` en el server component) y a `/ayuda`. Se llega vía el avatar flotante [`MobileProfileAvatar`](components/layout/MobileProfileAvatar.tsx), que ahora acepta prop `supportUnread` y pinta un **punto de aviso azul** sobre el avatar cuando hay no-leídos (los 3 layouts que lo montan — `(sales)`, `(admin)`, `(manager)` — ya calculaban `supportUnread` para el sidebar y ahora se lo pasan). La tarjeta se muestra a los 4 roles (en desktop es redundante con el footer del sidebar pero inocua; resuelve también el caso esquina admin/manager en mobile). `/perfil` no monta el avatar flotante, así que ahí el indicador es el badge de la tarjeta. Verificado E2E con la cuenta de Cornel en viewport móvil (mensaje de admin de prueba → punto en avatar + badge "1" → abrir conversación → ambos se apagan; datos de prueba revertidos).

⚠️ **No hay**: WebSockets, push notifications, asignación de conversaciones, notas internas, auto-cierre. Pendiente para fase 2 si el uso lo justifica.

### 4.46 Pestaña "Atribuidas" en Verificación — reasignar reseñas ya atribuidas

La bandeja de Verificación ([app/(profile)/resenas/verificacion/page.tsx](app/(profile)/resenas/verificacion/page.tsx)) solo listaba `pending` / `unmatched` / `removed`, así que una reseña ya atribuida (`counted`) al comercial equivocado **no se podía reasignar desde ninguna pantalla** (`/manager/resenas` es solo lectura: solo marcar eliminada/restaurar).

Se añadió una pestaña **"Atribuidas"** (`?state=counted`) que lista las `counted` reutilizando el panel de reasignación que ya existía:
- `reassignReview` ([verificacion/actions.ts](app/(profile)/resenas/verificacion/actions.ts)) **no tiene guardia por estado** — ya funcionaba sobre cualquier reseña (valida scope, cliente↔comercial, aplica anti-fraude mig 015). NO se tocó.
- `FullRow` de [ReviewVerificationRow.tsx](app/(profile)/resenas/verificacion/ReviewVerificationRow.tsx) ya renderiza Reasignar/Rechazar para admin/manager/director sobre cualquier reseña. NO se tocó.
- Cambio acotado a `page.tsx`: aceptar `state=counted`, contador `countedCount`, chip "Atribuidas (N)" (solo `!isSalesViewer`), **límite defensivo `.limit(500)`** (las counted pueden ser muchas; orden por `google_created_at desc` → la recién mal atribuida sale arriba) y textos del topbar/empty-state/ayuda.
- **Sales**: la pestaña NO se renderiza (las chips solo se pintan para no-sales). Si fuerza `?state=counted`, `SalesRow` muestra "ya atribuida, no requiere acción" y la RLS solo le deja ver las suyas → inocuo.

Sin migración, sin tocar RLS. Para corregir una atribución: Verificación → "Atribuidas" → localizar → "Reasignar" → elegir comercial (+ cliente) correcto.

### 4.47 Atribución por proximidad temporal a un único comercial (matcher)

**Caso real (Cornel, 2026-06-08):** un cliente abrió el **enlace personal** de Cornel (`/c/cornel-popescu`, QR de "Mi enlace" → `share_link` con `sales_id = Cornel`, `client_id = null`) y dejó una reseña **12 s después** (autor "Eduuu Bermejo", 5★, **sin texto**). Quedó `unmatched`: el nombre del autor no casaba con ningún cliente (`nameScore 0`) y sin texto no había mención que rescatar (§4.38). La identidad del **comercial** era inequívoca (es su enlace), pero el matcher no atribuía solo por proximidad temporal.

**Hueco cerrado** (en [lib/matching/attribute-review.ts](lib/matching/attribute-review.ts), `attributeBySingleCommercialInWindow`): tras fallar la atribución por nombre (`primaryAttribution`) y por mención (`attributeByCommercialMention`), si seguimos en `unmatched`, se mira la ventana corta: si en ella hubo clics de **EXACTAMENTE UN** comercial → se atribuye en automático (`counted`, confianza 70) a ese comercial, **sin cliente**.

- **Ventana**: `SINGLE_COMMERCIAL_TEMPORAL_WINDOW_HOURS = 0.5` (30 min). ⚠️ **Bajada de 12h a 0.5h el 2026-06-08** tras el **primer falso positivo en prod**: con la ventana de 12h, una reseña orgánica ("Miroslava Vucheva", 5★, "Es un lugar maravilloso") se atribuyó a Cornel solo porque él había clicado su enlace genérico **3h antes**. El flujo real "clic → reseña" ocurre en minutos (el caso Eduuu fueron 12s), no en horas; el único discriminador entre legítimo y orgánico es el tiempo, así que la ventana tiene que ser corta. Mucho más estrecha que la general de 48h a propósito: Google no nos dice qué reseña vino de qué clic (§4.38). Si reaparecen falsos positivos, bajarla más (p.ej. 0.25h = 15 min) o degradar el path a `pending` para que un humano confirme.
- **Guarda dura**: si en la ventana hay clics de **>1 comercial distinto** → ambiguo → `null` (no adivina). Elige el clic más cercano en el tiempo solo para el `share_link_id` de evidencia.
- **Atribución del cliente por clic en enlace específico (ampliado 2026-06-10)**: si entre los clics de ese único comercial hay un clic en el enlace **específico de UN solo cliente** (`/c/{comercial}/{cliente}`, `client_id` no nulo), se atribuye también **ese cliente** — aunque el nombre de Google del reseñador no case (caso "Maf" vs "Marta Ferrer", §4.38): el clic en SU enlace lo identifica. `reason: "counted_by_single_commercial_temporal_with_client"`, confianza `SINGLE_COMMERCIAL_TEMPORAL_WITH_CLIENT_CONFIDENCE = 80` (mayor que los 70 del temporal-only: evidencia más fuerte). Beneficio colateral: poblar `client_id` mete la reseña en el anti-fraude por cliente (mig 015) → cierra el hueco §4.37 M2 (sesgo conservador: si por error casara con un cliente que ya tiene principal, quedaría `is_duplicate` y NO contaría — nunca infla).
- **`client_id` null solo en clic genérico o multi-cliente**: si el clic fue al enlace **genérico** del comercial (`client_id=null`), o hubo clics de **varios clientes distintos** del mismo comercial (no se puede desambiguar), se atribuye el comercial **sin cliente** (confianza 70, `reason: "counted_by_single_commercial_temporal"`). Adivinar cliente cuando `primaryAttribution` no llegó a `PENDING_THRESHOLD` sería arriesgado (anti-fraude). Lo afina el humano/comercial al confirmar. ⚠️ Una `counted` con `client_id=null` cuenta en KPI pero no es dedupable (§4.37 M2, riesgo aceptado, idéntico a la mención Tier 2).
- **Restringido a autores con nombre** (`hasAuthorName !== false`): los anónimos conservan su path dedicado (`primaryAttribution` modo temporal-only, §258-295) — cambio quirúrgico, no altera su comportamiento.
- **`reason: "counted_by_single_commercial_temporal"`** en `match_evidence`. Reversible desde Verificación → "Atribuidas" (§4.46).

Sin migración, sin cambios en el cron ni en BD: `loadCandidates` ([lib/cron/process-reviews.ts](lib/cron/process-reviews.ts)) ya carga todos los `share_links` de la ficha en ventana (incl. `client_id` y `client_full_name`), y la función usa `sales_id` + `opened_at` + `client_id`. **Solo aplica a reseñas nuevas** que entren por el cron — las ya en BD (como la de Eduuu) se reclaman a mano. Tests en [lib/matching/__tests__/attribute-review.test.ts](lib/matching/__tests__/attribute-review.test.ts) (incl. el escenario real de Eduuu, el clic en enlace específico que atribuye cliente, multi-cliente sin desambiguar, y el límite de los 30 min).

**Falso positivo corregido (2026-06-08, datos de prod):** "Miroslava Vucheva" se revirtió a `unmatched` (audit `manual_unmatch_false_positive`) y la reseña legítima del cliente real de Cornel ("Esteban", de Esteban Abad Madrid, que estaba en `pending` 63% por nombre débil) se confirmó a `counted` (audit `manual_confirm`).

### 4.48 Responder reseñas de Google desde la plataforma (flujo asistido híbrido — mig 024)

El gestor (José González, `reviews_manager`) responde a diario las reseñas de las 7 fichas. Antes no se podía desde ReseñaHub. Ahora hay una **bandeja de respuestas** en `/resenas/respuestas` para **admin + reviews_manager** (NO sales, NO office_director — decisión de producto).

> **✅ ACTIVADO 2026-06-10 (cuota BP concedida, §4.50).** El enfoque sigue siendo **HÍBRIDO por fuente**, pero la rama API ya está viva:
> - **Reseñas BP nuevas** → un clic: **Publicar en Google** (`publishReviewReply` → `replyToReview` PUT v4 → `reply_via='api'`, guarda en la app + publica en Google a la vez).
> - **Reseñas históricas de Places** (`places:...`, sin reviewId real) → siguen en **flujo asistido manual** (Copiar texto + Responder en Google + Marcar respondida, `reply_via='manual'`). Decisión "solo nuevas": NO se reconcilian las ~156 históricas (§4.50 pendiente c).
> - **Respuestas puestas directo en Google** → el cron BP las detecta vía `reviewReply` y las saca de la cola (`reply_via='google_detected'`, ver más abajo "Sync del reviewReply").
> - Bandeja "Sin responder" ordenada **recientes primero**.

Contexto histórico (cómo nació): responder en Google **solo** es posible vía Business Profile API (`PUT v4/{locationResource}/reviews/{reviewId}/reply`, scope `business.manage`), que estuvo a **cuota 0** hasta el 2026-06-10. Mientras tanto las reseñas entraban por Places API, que no devuelve la respuesta del propietario y sintetiza el `google_review_id` (`places:...`, inútil para el endpoint reply). De ahí el diseño híbrido por fuente, que se mantiene.

**Migración 024** ([supabase/migrations/024_review_replies.sql](supabase/migrations/024_review_replies.sql)): añade a `reviews` las columnas `reply_text` (UTF-8 → emojis), `replied_at` (NULL = pendiente, pivota toda la UI/contadores), `reply_by` (FK profiles, quién respondió), `reply_via` (text+CHECK `manual|api|google_detected`), `reply_synced_at` (fase API). Índice parcial `reviews_pending_reply_idx` sobre `replied_at IS NULL AND removed_at IS NULL` para la cola/contador. **Sin RLS nueva**: admin/manager ya tienen UPDATE amplio; el gating "solo admin+manager" se hace en código.

**Gating** ([lib/auth/reply-gating.ts](lib/auth/reply-gating.ts), módulo puro): `canReplyToReviews(role)` (admin/manager), `replyTextSchema` (trim, 1..4096 = tope Google, emojis intactos sin sanear), `isReplied()`.

**Server actions** ([app/(profile)/resenas/respuestas/actions.ts](app/(profile)/resenas/respuestas/actions.ts)): `saveReviewReply` (marca respondida `manual`, rechaza eliminadas, audit `reply_saved`), `clearReviewReply` (revierte a pendiente, audit `reply_cleared` — ⚠️ solo limpia la app, NO borra la respuesta en Google: el endpoint reply es PUT idempotente, no hay DELETE), `publishReviewReply` (**ACTIVA**; valida `business_profile` + no `places:`, usa `getValidAccessTokenForLocation` + `replyToReview`, audit `reply_published`). Patrón de `verificacion/actions.ts`: actor cookie-client + `getReplyActor` + `recordAudit` + `revalidatePath` (`/resenas/respuestas` + `/manager/resenas`).

**Cliente Google** ([lib/google/business-profile.ts](lib/google/business-profile.ts)): método `replyToReview(accessToken, locationResource, reviewId, comment)` (PUT, `fetchWithRetry`) — invocado desde `publishReviewReply`.

**Sync del `reviewReply` (google_detected, §4.50)**: cuando alguien responde una reseña BP **directamente en Google**, el cron BP lo detecta y la saca de "Sin responder". Helper puro [lib/google/owner-reply.ts](lib/google/owner-reply.ts) `normalizeOwnerReply` (strip de traducción §4.51 + fecha ISO; tests en [owner-reply.test.ts](lib/google/__tests__/owner-reply.test.ts)). Dos casos en [sync-google-reviews/route.ts](app/api/cron/sync-google-reviews/route.ts): **A** reseña fresca que ya trae respuesta → se persiste en el insert ([process-reviews.ts](lib/cron/process-reviews.ts), `FreshReview.reply`); **B** reseña ya en BD que gana respuesta después → `syncExistingReplies` (1 SELECT `replied_at IS NULL` + UPDATEs acotados a las que cambiaron, re-aseverando `replied_at IS NULL` en el UPDATE → race-safe). Ambos escriben `reply_via='google_detected'`, `reply_by=null`, audit `reply_google_detected` (`on_insert` distingue A/B). **Guarda dura**: NUNCA pisa un `api`/`manual` (el filtro `replied_at IS NULL`). El cron de Places no se ve afectado (sus `FreshReview` nunca traen `reply`).

**UI** ([app/(profile)/resenas/respuestas/page.tsx](app/(profile)/resenas/respuestas/page.tsx) + [ReviewReplyComposer.tsx](app/(profile)/resenas/respuestas/ReviewReplyComposer.tsx)): bandeja dedicada (NO se amplió `/manager/resenas`, que es vista de consulta). Vive en route group `(profile)` para que admin Y manager reciban su chrome correcto (`(profile)/layout.tsx` elige sidebar por rol). Pestañas `?tab=`: **Sin responder** (`replied_at IS NULL`, **recientes primero** `google_created_at DESC` — lo último que entra sube arriba) · **Respondidas** (`replied_at DESC`). Filtros opcionales: ficha (`location_id`) y `rating_lte=2` (priorizar ≤2★, §4.29). Composer client (patrón `RemovalControls`): textarea con emojis + contador n/4096. Botones según fuente (`canPublishApi = source==='business_profile' && !places:`): BP → **Publicar en Google** (primario, un clic API) / Copiar / Marcar sin publicar; Places → **Marcar respondida** (primario) / Copiar texto / Responder en Google. Siempre **Ver reseña**. En Respondidas muestra texto + vía + autor + fecha con **Editar** / **Marcar como no respondida**.

⚠️ **Dos enlaces distintos a Google (importante):** la lista pública de reseñas (`buildGoogleReviewListUrl` → `search.google.com/local/reviews`) **NO tiene caja de respuesta** — solo sirve para LOCALIZAR la reseña ("Ver reseña"). Para responder, el propietario va a su panel: **"Responder en Google"** → `https://business.google.com/reviews` (constante `GBP_REVIEWS_URL` en `ReviewReplyComposer.tsx`). No es deep-link por reseña (Google no lo permite sin los IDs internos que solo da la Business Profile API); con varias fichas, se elige la ficha en ese panel. Cuando llegue la cuota BP, el botón pasa a "Publicar en Google" (un clic, sin salir).

**Sidebar + middleware**: item "Respuestas" (icono `Reply`) en `ADMIN_SIDEBAR_GROUPS` (grupo reviews) y `MANAGER_SIDEBAR_GROUPS`. Middleware abre `/resenas/respuestas` a `reviews_manager` (admin pasa todo; sales/director NO). **Sin badge de no-leídos en sidebar** (el `(N)` va en la pestaña + topbar — evita un count por render de layout).

**Tests**: [lib/auth/__tests__/reply-gating.test.ts](lib/auth/__tests__/reply-gating.test.ts) (gating + schema con emojis + bordes 4096/4097 + `isReplied`) y casos de `/resenas/respuestas` en [lib/__tests__/route-access.test.ts](lib/__tests__/route-access.test.ts).

**Respuestas v2 — paginación + filtro de fechas + limpieza de históricas (2026-06-10)**:
- **Paginación** (primer paginador del código): searchParam `page` (1-based), `PAGE_SIZE=25`, `.range(offset, offset+24)` en vez del `.limit(1000)`. Componente reutilizable [components/ui/Pagination.tsx](components/ui/Pagination.tsx) (server, Prev/Next como `<Link>`, "X–Y de Z · Página N de M", oculto si 1 página). Recuento FILTRADO aparte (espeja los filtros de la lista) para `totalPages`; los chips "(N)" siguen siendo el total GLOBAL.
- **RangePicker en "Respondidas"** (filtra por `replied_at`, default periodo de comisión, atajos `commissionShortcuts`). La pestaña "Sin responder" NO se filtra por fecha (se ven todas). `RangePicker` ganó prop opcional `resetParams=["page"]` para resetear la paginación al cambiar de periodo (manager/dashboard no lo pasan → sin cambios).
- **`buildHref` nunca arrastra `page`** (todo cambio de tab/ficha/rating/rango resetea a página 1); solo Prev/Next lo setean. Arrastra `from/to` solo en `answered`.
- **Limpieza one-shot de Places ya respondidas** (decisión de negocio: las antiguas ya respondidas en Google no deben aparecer en "Sin responder"). Las ~167 de Places tenían `replied_at IS NULL` aunque José ya las contestó en Google; el sync `google_detected` no las alcanza (el cron BP corta en `BP_GO_LIVE_AT` y casa por `google_review_id`, no por el `places:` sintético). Script `scripts/reconcile-places-replies.mjs` (gitignored, one-shot, **no recurrente** — Places está apagado): pagina TODO Google por ficha, casa Places↔Google por **autor+estrella+fecha (ventana 48h, cubre el desfase de `time` de reseñas editadas §4.41)** y marca las que tienen `reviewReply` como `google_detected` (audit `reply_google_detected reconciled:true`). Resultado 2026-06-10: **167 → 16** "Sin responder" (151 marcadas; 14 ya no existen en Google = borradas/renombradas → fuera de alcance, son `reconcileRemoved` §4.20; 2 genuinamente sin responder). Las marcadas tienen `replied_at` = cuándo se respondió en Google (a menudo antiguo) → no ensucian el "Respondidas" del periodo actual.

⚠️ **Consistencia con Google en fase asistida:** marcar "respondida" no prueba que se pegó en Google; `reply_via='manual'` lo deja explícito y `google_detected` reconciliará la verdad cuando llegue BP.

### 4.49 Tope de reseñas BONIFICABLES por productor (mig 026)

Cambio de política de dirección (2026-06-10): a cada productor (sales + office_director) se le abona comisión por un **MÁXIMO de N reseñas por periodo de comisión (20→19)**, default 5. El comercial puede conseguir más reseñas (siguen contando para producción, ranking, insignias e historial), pero el € se calcula solo sobre `min(counted, tope)`.

**Concepto DISTINTO de `monthly_goal`** (mig 018, "lo que se le exige" / objetivo aspiracional, sin cambios). El tope es "cuántas reseñas son bonificables".

**Columna** (mig 026): `profiles.commission_cap int` (nullable, `DEFAULT 5`). `NULL` = **sin tope** (paga todas; escape-hatch para exentos + comportamiento legacy). Backfill de productores existentes a 5. La migración **también reescribe `profiles_self_update`** congelando `commission_cap` (regla §4.36: todo campo financiero nuevo se congela en la misma migración; sin esto un sales se subiría el tope por PostgREST directo). El test de regresión [lib/__tests__/rls-self-update.test.ts](lib/__tests__/rls-self-update.test.ts) lo incluye en `FROZEN_COLUMNS`.

**Helper puro** [lib/commission.ts](lib/commission.ts) — única fuente de verdad: `payableCount(counted, cap)`, `commissionEuro(counted, rate, cap)`, `pendingCommissionEuro(counted, pending, rate, cap)` (marginal: las pending solo suman lo que cabe bajo el tope), `isCapped(counted, cap)`. Tests en [lib/__tests__/commission.test.ts](lib/__tests__/commission.test.ts).

**Validación**: `commissionCapSchema` ([lib/validation/sales-schemas.ts](lib/validation/sales-schemas.ts)) — entero ≥0, "" → null, cota [0,9999]. Editable en la ficha del productor (comerciales + directores: `InviteSalesButton`/`SalesEditCard`, `InviteDirectorButton`/`DirectorEditCard`; actions añaden `commission_cap` al payload + lo registran en el `audit_log action='update_commission_rate'`).

**UI "reales + bonificadas + aviso"** (aplica el helper):
- Panel ([panel/page.tsx](app/(sales)/panel/page.tsx)) y `/panel/resenas`: el número grande sigue siendo las abonables reales; debajo "X de {tope} bonificadas" + aviso "máximo {tope} pagadas por periodo" cuando se supera; € sobre el tope. El Ring sigue en `counted/goal` (objetivo, sin tocar).
- Ficha de gestión: [ProducerSummary.tsx](components/panel/ProducerSummary.tsx) (prop `commissionCap`) + `<Term "Reseñas bonificables">` + el campo en `SalesEditCard`.
- **Excel individual** ([lib/reports/sales-report.ts](lib/reports/sales-report.ts), el que va a pagos): fila de cabecera "Reseñas bonificables (tope)", per-fila el excedente sale "0 € (tope)", **TOTAL COMISIÓN = rate × payableCount** + nota al pie.

⚠️ **Fuera de alcance (decisión consciente):** el **parte semanal global** ([weekly-report.ts](lib/reports/weekly-report.ts), Raquel) mide productividad por departamento (cuenta reseñas, no €) → **sin tope**. **Ranking** ([leaderboard.ts](lib/leaderboard.ts)) ordena por counted reales → sin cambios. **Insignias** ([panel-badges.ts](lib/panel-badges.ts)) por `monthly_goal`/volumen → sin cambios. Si se quisiera topar el parte, abordar aparte.

### 4.50 Business Profile activado — fuente única going-forward (2026-06-10)

Cerró el bloqueo de meses (cuota concedida, caso `5-5855000041022`). **Fase 4 ✅.** Estado vivo:

- **Fuente de reseñas = Business Profile API**, fuente ÚNICA. Places API **apagado** (cron quitado de `vercel.json`; el código de Places y su endpoint siguen existiendo, reactivables, pero no se disparan). El cron BP (`/api/cron/sync-google-reviews`) corre cada hora vía GitHub Action [`sync-reviews-hourly.yml`](.github/workflows/sync-reviews-hourly.yml) + diario de respaldo en `vercel.json` (`5 5 * * *`).
- **Going-forward only**: constante `BP_GO_LIVE_AT` en [sync-google-reviews/route.ts](app/api/cron/sync-google-reviews/route.ts). El cron solo inserta reseñas con `createTime >= BP_GO_LIVE_AT` y deja de paginar en cuanto una página entera es anterior al corte. Por eso NO entra el histórico de Google (Oropesa 1.622, Castellón 516…) ni dispara alertas ≤2★ retroactivas. ⚠️ Si algún día se quiere importar histórico, subir/quitar el corte con cuidado (suprimir alertas durante la carga).
- **Resource completo**: `locations.google_location_resource` guarda `accounts/{cuenta}/locations/{id}` (lo exige la v4 de reviews y reply). `linkGoogleLocation` lo compone si llega relativo. Cuenta de Google de las 7 fichas: `accounts/111197444117937021993`.
- **Responder por API** (Bloque G ✅): `/resenas/respuestas` muestra "Publicar en Google" para reseñas BP (`publishReviewReply` → `reply_via='api'`); un clic guarda en la app + publica en Google. Bandeja "Sin responder" ordenada **recientes primero** (las nuevas BP, que sí se publican por API, suben arriba). Las de Places (histórico, `google_review_id` `places:…`) siguen con el flujo asistido manual (no tienen reviewId real → no publicables por API; decisión "solo nuevas", §4.48). **Sync del `reviewReply` ✅** (§4.48): el cron BP detecta respuestas puestas DIRECTAMENTE en Google y las saca de "Sin responder" (`reply_via='google_detected'`), sin pisar las nuestras (`api`/`manual`).
  - **✅ Verificado E2E en prod 2026-06-10**: (a) **app→Google**: reseña de prueba "AleCris" en Castellón → "Publicar en Google" → respuesta **live en Google** confirmada por API (`reply_via='api'`); (b) **Google→app**: las 10 reseñas BP que José ya había respondido en Google se marcaron solas `google_detected` al correr el cron; (c) **matcher por mención**: "AleCris" (no es cliente) se atribuyó a Almudena por nombrarla en el texto (§4.38).
  - ⚠️ **Delay de propagación de Google**: una reseña recién escrita tarda **unos minutos** en aparecer en la Reviews API v4. Si el cron corre justo al publicarse, no la ve hasta el siguiente run (no es un bug — esperar al siguiente ciclo horario).
- **Pendientes deliberados**: (a) **deep-link a reseña concreta** — NO se hace: Google no da URL pública por `reviewId` de la API (§4.25); se mantiene "Ver reseña" → lista. (b) ~~soft-delete automático~~ ✅ reactivado el 2026-06-11 con capa `missing_since` + umbral 24h, solo cron BP (mig 028, ver §4.20). (c) **reconciliar las ~156 reseñas históricas de Places** para publicarles respuesta por API — NO se hace (decisión "solo nuevas", §4.48): requeriría migración + barrido contra Google casando por autor/estrella/fecha. Se quedan en flujo manual.

⚠️ **Reseñas viejas en BD**: las ~72 de `source='places_api'` (desde 2026-05-23) + las recientes se quedan tal cual (no se borran). Going-forward todo es `business_profile`. No se vuelven a generar clones porque Places está apagado.

### 4.51 Quitar la traducción automática de Google del texto de la reseña (2026-06-10)

La API v4 de Business Profile devuelve el `comment` con una **traducción automática incrustada** cuando el idioma de la reseña ≠ locale de la cuenta de Google. Formato consistente observado en prod:

```
<texto original del cliente>

(Translated by Google)
<traducción automática>
```

(Google puede invertir el orden — traducción primero, original tras `(Original)` — aunque hoy no se da ningún caso). Antes guardábamos el `comment` verbatim → en la plataforma se veía el original + "(Translated by Google)" + la traducción, todo pegado (caso reportado: reseña de Mercedes García). No pasaba con Places API porque ese endpoint respetaba `language=es`.

**Fix**: helper puro [lib/google/strip-translation.ts](lib/google/strip-translation.ts) `stripGoogleTranslation(comment)` (extrae solo el original; cubre ambos órdenes de Google; marcadores siempre en inglés). Cableado en la normalización del cron BP ([sync-google-reviews/route.ts](app/api/cron/sync-google-reviews/route.ts) → `text: stripGoogleTranslation(gr.comment ?? null)`). Tests en [lib/google/__tests__/strip-translation.test.ts](lib/google/__tests__/strip-translation.test.ts) (8 casos).

**Seguro para el matcher** (§4.38): el original conserva la mención al comercial (los nombres propios no se traducen). **Backfill one-shot** aplicado el 2026-06-10 a las 5 reseñas BP que ya tenían la traducción pegada (service-client, no migración). Verificado: 0 reseñas con el marcador.

⚠️ Decisión de producto: guardamos **solo el original** (no la traducción en campo aparte). Si el dpto. internacional quisiera leer en español lo que escriben en otros idiomas, habría que añadir columna + migración ("Ask first").

### 4.52 El sync manual usaba Places → clones Places/BP (fix + limpieza, 2026-06-10)

**Síntoma (José):** al pulsar "Sincronizar" salía `Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, y aparecían reseñas/respuestas **duplicadas** (una con botón "Publicar en Google" = copia BP, otra con "Responder en Google" = copia Places).

**Causa:** [`/api/sync/now`](app/api/sync/now/route.ts) seguía llamando a `syncPlaces()` después de apagar Places el mismo día (§4.50). Con Places caído, el endpoint se colgaba hasta el timeout de Vercel → HTML 504/500 → `SyncNowButton` hacía `res.json()` sobre HTML → el error críptico. Y mientras procesaba fichas antes del timeout, **insertaba copias `places:`** de reseñas que el cron BP ya había traído → clones (el `unique(location_id, google_review_id)` no los detecta: IDs distintos, §4.26 Bloque B).

**Fix (commit `4dcf6cf`):**
- La lógica del cron BP (antes inline en [`sync-google-reviews/route.ts`](app/api/cron/sync-google-reviews/route.ts)) se extrajo a [`lib/google/sync-business-profile.ts`](lib/google/sync-business-profile.ts) (`syncBusinessProfile({ locationIds? })`, mismo patrón "nunca lanza" que `syncPlaces`). La usan **el cron Y el sync manual**. El cron quedó como wrapper fino (auth + llamada), comportamiento idéntico.
- `/api/sync/now` → `syncBusinessProfile`. El botón ya sincroniza por BP.
- [`SyncNowButton`](components/ui/SyncNowButton.tsx) protege el `res.json()`: si la respuesta no es JSON (timeout/HTML), mensaje claro en vez del "Unexpected token '<'".
- No queda fuente de Places: `vercel.json` solo BP, el único GitHub Action apunta a BP, y `/api/cron/sync-places-reviews` no lo dispara nada (reactivable, §4.50).

**Limpieza one-shot** (`scripts/dedup-places-bp-clones.mjs`, gitignored, count-first + audit): **11 pares clon** del 2026-06-10 → borrada la copia `places_api`, conservada la BP (autoritativa, `reply_via='api'` donde aplica), y **recalculado el anti-fraude** por cliente (mig 015) para promover a principal las 4 copias BP que habían quedado `Duplicada`. `audit_log action='places_bp_clone_dedup'` ×11. Verificado: 0 pares restantes, 0 clientes con ≠1 principal. Las 158 reseñas `places_api` históricas (sin par BP) no se tocaron.
- **De paso:** corregido un caso preexistente (NO causado por esta limpieza) — cliente "Marina Kudryavtseva": su principal se soft-removió en la limpieza de ediciones §4.41 (2026-06-04) pero la superviviente quedó `is_duplicate=true` sin promover (§4.23: `markReviewRemoved` no toca `is_duplicate`) → su única reseña activa no contaba. Promovida a principal (`audit_log action='promote_orphan_principal'`).

### 4.53 Slug del productor = nombre + primer apellido + alias `previous_slug` (mig 027)

Decisión de negocio (2026-06-11): el enlace público `/c/{slug}` debe llevar solo **nombre + primer apellido** (antes se generaba con el `full_name` completo: `tono-sanchez-abadia`). El `full_name` visible NO cambia — solo el slug.

**Alias con fallback (la pieza clave):** cambiar un slug rompería los QRs impresos y los WhatsApps ya enviados (el lookup de [lib/landing.ts](lib/landing.ts) era por slug exacto → enlace viejo caía en Google Maps genérico SIN registrar la visita). La mig 027 añade `profiles.previous_slug` (+ índice único parcial) y `recordOpenAndRedirect` hace un **segundo lookup por `previous_slug`** si el primero falla → el enlace viejo sigue redirigiendo a writereview Y atribuyendo al mismo comercial. Verificado E2E en prod con `/c/tono-sanchez-abadia` (alias) y `/c/tono-sanchez` (nuevo): ambos 302 a writereview + visita en `share_links` con el `sales_id` correcto.

- **Renombrado one-shot aplicado 2026-06-11**: 33 de 53 productores (script `scripts/rename-producer-slugs.mjs`, gitignored, dry-run + colisiones + `audit_log action='slug_renamed'`). Nombres de pila compuestos conservados (`maria-jesus-lozano`, `ana-isabel-prior`, `jefferson-javier-piguave`); `victor-clemente-moro` → `victor-clemente` (decisión del admin). 0 solapes slug/alias tras aplicar.
- **Altas futuras**: los modales de invitación (comerciales + directores) muestran un campo **"Enlace (slug)" editable**, auto-rellenado con [`shortNameForSlug`](lib/utils.ts) (primer token + siguiente no-partícula; arrastra `de/del/van/...`). ⚠️ La heurística NO detecta nombres de pila compuestos ("María Jesús" → `maria-jesus` sin apellido) — por eso el campo es editable y el hint lo avisa. Server-side: `inviteSlugSchema` ([lib/validation/sales-schemas.ts](lib/validation/sales-schemas.ts)) valida formato; sin slug del form, la action genera con la heurística.
- **Colisiones**: `createInvitedProfile` ([lib/invite.ts](lib/invite.ts)) y `restoreSales`/`restoreDirector` comprueban contra `slug` **y** `previous_slug` (un alta/restauración no puede reutilizar el alias de otro).
- **Archivado**: `archiveSales`/`archiveDirector` ponen `previous_slug = null` (un archivado no debe seguir capturando visitas por su enlace viejo).
- **Seguridad (regla §4.36)**: la mig 027 reescribe `profiles_self_update` congelando `previous_slug` — sin esto un sales podría auto-asignarse el slug viejo de otro vía PostgREST y secuestrar sus visitas. `previous_slug` está en `FROZEN_COLUMNS` del test de regresión.
- ⚠️ Solo se guarda **UN** alias. Si algún día se renombra por segunda vez, el alias más viejo se pierde (aceptado). Los bookmarks internos a `/comerciales/{slug-viejo}` dan 404 (los listados regeneran el link) — sin alias interno, aceptado.

### 4.54 Enlace directo a la reseña concreta en Google Maps (mig 029) — RESUELTO (oficial Places New + pegado manual + agente en PC con Chrome real)

Hasta ahora los listados/Excel solo enlazaban a la **lista** de reseñas de la ficha (`buildGoogleReviewListUrl`). Objetivo: que cada reseña tenga su **deep-link a la reseña concreta** (`https://www.google.com/maps/reviews/data=…`, el que genera "Compartir reseña" en Maps).

**Hallazgo del spike (2026-06-11):** ninguna API oficial de Google da URL por reseña (ni Business Profile ni Places New — esta última solo da `googleMapsUri` de ~5 reseñas "destacadas" por ficha). El `reviewId` que guardamos (`AbFvOqm…`) **no** se relaciona con el token del enlace de compartir (`Ci9DQUlR…`): son espacios distintos, no hay conversión. La ÚNICA vía completa+automática es el **feed interno de Maps** (decisión de negocio consciente: endpoint no documentado, zona gris de ToS, solo-lectura; riesgo a la ficha bajo). Verificado E2E contra Oropesa: el FID se resuelve de la página de ficha (`0xd60489fe4101153:0xe9174fc12c1908e8`, coincide con los share-links reales) y "Compartir reseña" produce `maps.app.goo.gl/…` que expande al deep-link.

**Veredicto del test de IP (2026-06-11):** la IP de datacenter (GitHub Actions) **NO está bloqueada** — la página de ficha responde 200, sin consent wall, y el FID se resuelve. El `listugcposts` GET responde sin captcha (pero vacío: Maps migró las reseñas a `batchexecute`/`T4jwAf`).

⚠️⚠️ **MURO REAL encontrado — el harvest automático NO es viable (2026-06-11):** Google Maps sirve a **cualquier Chrome lanzado por Playwright** (headless, headed, `channel:"chrome"`, perfil persistente, con/sin flujo de consentimiento, con anti-automation flags + `navigator.webdriver` spoofeado) una versión **REDUCIDA** de la ficha: solo el resumen de valoraciones, SIN pestaña "Reseñas" ni tarjetas `div[data-review-id]` → la extracción saca 0 reseñas. El ÚNICO entorno que renderizó las reseñas fue un **Chrome real al que se ADJUNTA** (la sesión de chrome-devtools MCP del spike): ahí la misma lógica de extracción sacó autor+rating+token perfectos (verificado). El discriminador es un Chrome real con perfil de confianza al que se conecta vía CDP, NO uno lanzado por automation — no reproducible en CI ni en un job versionado. NO es la IP (esa pasa); es anti-automatización del módulo de reseñas.

**Lo entregado y VERIFICADO (commits `40d65d5`, `c3c0b6c`, + este — desplegable sin regresión):**
- **Migración 029** (aplicada en prod): `locations.google_fid` + `reviews.google_maps_url` + `reviews.maps_url_matched_at` + índice parcial `reviews_maps_url_pending_idx` (cola).
- **Degradación transparente**: [`buildGoogleReviewUrl({mapsUrl, placeId})`](lib/google/review-url.ts) → deep-link si existe, si no la lista de la ficha, si no null. `<GoogleReviewLink mapsUrl=…>` + propagado a los 7 call sites + Excel + email ≤2★. **Sin deep-link, todo sigue llevando a la lista → CERO regresión.** Poblar `google_maps_url` por cualquier medio activa el deep-link al instante en toda la app.
- **Construcción de la URL VERIFICADA E2E**: [lib/google/maps-ugc.ts](lib/google/maps-ugc.ts) `buildMapsReviewUrl(dataReviewId, fid)`. El `data-review-id` (token del botón "Compartir" en el DOM) base64-decodifica a `0x0a 0x2f <INNER:47B> 0x10 0x01`; la URL es `/maps/reviews/data=!4m8!14m7!1m6!2m5!1s{TOKEN}!2m1!1s0x0:0x{CID}!3m1!1s2@1:{INNER}||` (CID = 2ª mitad del FID). Probado: abre la reseña exacta de "Lisset Miguel" en Oropesa. Tests en `__tests__/maps-ugc.test.ts`.
- **Matcher puro** [lib/google/maps-url-matching.ts](lib/google/maps-url-matching.ts): casa DOM↔BD por autor (`nameSimilarity`≥90) + rating + fecha **opcional** (guarda laxa ±31d, porque el DOM solo da fecha relativa), SOLO match único en ambos sentidos (conservador). Tests propios.
- **Runner** [jobs/enrich-review-urls.mjs](jobs/enrich-review-urls.mjs): orquesta resolver-FID → extraer DOM → matchear → escribir (`UPDATE … WHERE google_maps_url IS NULL`, race-safe; audit `review_maps_url_matched`). ⚠️ **No funciona con navegador automatizado** (ver muro arriba) — queda como herramienta experimental hasta tener un runner sobre Chrome real vía `connectOverCDP`.

**Solución implementada (2026-06-11, sin scraping) — dos capas + spike concluido:**

- **Spike de derivación offline — REFUTADO a nivel de byte (definitivo).** `scripts/crack-review-token.mjs` (gitignored) decodifica los `google_review_id` reales de `business_profile`: todos son `01 b1 6f 3a a9` (prefijo de versión constante) + ~48 bytes de **alta entropía sin ningún ASCII** → identificador opaco, con pinta de cifrado/HMAC, **sin el post-id de Maps embebido**. El token de Maps, en cambio, lleva el post-id en CLARO (`rp_h:G2YuBxj44kGJ2CrgrM0SYg`, decodificado del INNER). Confirma lo que el matcher ya afirmaba: **no hay transformación offline `reviewId → token`**. Por eso NO existe `buildMapsReviewUrlFromApiId` ni cableado al cron — sería imposible. (La reseña "verificada E2E" de Lisset Miguel resultó ser `source='places_api'` con el token COMO id sintético — no servía de par; la refutación viene de la estructura de los ids `business_profile`.)

- **Capa 1 — cosecha OFICIAL vía Places API (New).** [lib/google/places-new.ts](lib/google/places-new.ts) (cliente v1, `X-Goog-FieldMask`, funciones puras + tests) lee las ~5 reseñas DESTACADAS por ficha, cada una con su `googleMapsUri` — que resulta ser el **deep-link canónico** `https://www.google.com/maps/reviews/data=…` ya construido por Google (no un enlace corto), con el FID embebido. Orquestación canónica [lib/google/enrich-maps-urls.ts](lib/google/enrich-maps-urls.ts) (`enrichReviewMapsUrls`, "nunca lanza"): casa con nuestras filas reutilizando el matcher conservador `matchUgcToReviews` (único 1↔1) y escribe `google_maps_url` (`UPDATE … WHERE google_maps_url IS NULL`, race-safe; audit `review_maps_url_matched` `source:'places_new_official'`). **Cron diario** [/api/cron/enrich-review-urls](app/api/cron/enrich-review-urls/route.ts) (vercel.json `30 5 * * *`, tras el sync BP de `5 5`) + job manual [jobs/enrich-review-urls-official.mjs](jobs/enrich-review-urls-official.mjs) (reimplementa la lógica inline por ser .mjs). Robusto, repetible, cero ToS-grey. Cubre solo las destacadas (~5/ficha; la API New no pagina). **Primera corrida (2026-06-11): 28 deep-links escritos** (de 35 destacadas; 7 rechazadas por el matcher conservador). ⚠️ **Requiere `GOOGLE_PLACES_API_KEY`** en el entorno local (job) **y en Vercel** (cron) — ya habilitada "Places API (New)", §4.18. Sin la key el cron corre pero no escribe nada (errores por ficha, matched 0; inocuo).

- **Capa 3 — pegado manual** (la base para reseñas de alto valor fuera de las destacadas). Server actions `setReviewMapsUrl`/`clearReviewMapsUrl` ([app/(profile)/resenas/maps-url-actions.ts](app/(profile)/resenas/maps-url-actions.ts), gating admin+manager vía [lib/auth/maps-url-gating.ts](lib/auth/maps-url-gating.ts)): aceptan el enlace de "Compartir reseña" (corto `maps.app.goo.gl/…`, que se EXPANDE server-side siguiendo el redirect, con whitelist de host anti-SSRF) o el deep-link canónico; validan que la URL final contenga `/maps/reviews/`. Validadores puros `isMapsShortShareUrl`/`isMapsShareUrlInput` en [lib/google/review-url.ts](lib/google/review-url.ts) (+ tests). UI: [components/ui/MapsUrlControl.tsx](components/ui/MapsUrlControl.tsx) inline por fila en `/manager/resenas` (toggle "+ Enlace directo" / "Cambiar" / "Quitar"). Funciona sin la key de Places.

- **El runner por navegador** [jobs/enrich-review-urls.mjs](jobs/enrich-review-urls.mjs) se deja como herramienta experimental (el muro de arriba). La variante `connectOverCDP` a Chrome real quedó **fuera de alcance**; se retoma si Capa 1 + pegado no bastan.

- **Cosecha COMPLETA vía Chrome real del MCP (2026-06-11) — 153/175 deep-links (~87%).** El muro de Playwright NO aplica al **Chrome real del MCP chrome-devtools**: renderiza el módulo de reseñas perfectamente (verificado: abre la reseña exacta). Procedimiento (scripts en `scripts/`, **gitignored** → no viajan entre Macs; reconstruibles): por ficha, navegar a `maps/place/?q=place_id:{id}`, abrir pestaña "Reseñas", ordenar "Más recientes", hacer scroll, y extraer de cada `div[data-review-id][aria-label]` el `{token, autor (aria-label), rating, fecha}` + el FID del `!1s` de la URL (⚠️ NO el primer `0x…:0x…` — Chamberí trae un `!5s` secundario delante). Luego `scripts/write-harvested-urls.mjs <harvest.json> <location_id> [fidOverride]` casa (matcher conservador único 1↔1) y escribe con el builder de [maps-ugc.ts](lib/google/maps-ugc.ts). Las 22 que faltan son anónimas (sin nombre que casar) o anteriores al tramo de feed cargado. Resultado por ficha: Oropesa 54/76, Valencia/Castellón 19/19, Chamberí 14/14, Leganés 5/5, Príncipe 7/7, Pardiñas 5/5.

- **Vía C (botón 100% Vercel) — DESCARTADA por spike (2026-06-11).** Se intentó replicar la llamada interna de Maps por fetch (sin navegador) para tener un botón puro en Vercel. Los GET simples (`listugcposts` con el FID, `listentitiesreviews` con cell/cid decimales) responden **200 pero vacíos**. La captura de red real (Chrome del MCP) confirma que Maps sirve las reseñas por `POST …/MapsWizUi/data/batchexecute?rpcids=T4jwAf` **atado a la sesión** del navegador (tokens/ids que solo existen tras cargar la página en un Chrome real). No replicable desde un servidor pelado → no hay vía pura-Vercel. Scripts del spike en `scripts/spike-maps-internal.mjs` (gitignored).

- **Vía B — AGENTE en el PC de oficina con Chrome real (2026-06-11) — ✅ la solución de cobertura total automática.** Productiviza la cosecha del MCP. Clave verificada: un `chrome.exe` lanzado **limpio** (`--remote-debugging-port`, **sin** los flags de automation que mete el launcher de Playwright) + `connectOverCDP` **sí** renderiza las reseñas (lo que Playwright `.launch()` NO lograba — esa era la diferencia). Único obstáculo: el muro de cookies, que se acepta una vez y **persiste en el perfil dedicado** (`agent/.chrome-profile/`, gitignored, no toca la navegación del usuario). [agent/harvest-maps-urls.mjs](agent/harvest-maps-urls.mjs): lee pendientes (idempotente, **catch-up** del backlog acumulado mientras el PC estuvo apagado), lanza Chrome, cosecha por ficha (misma lógica que el MCP), casa (matcher único 1↔1) y escribe; **cierra el Chrome que abrió** al terminar. [agent/run-harvest.cmd](agent/run-harvest.cmd) + acceso directo en la **carpeta de Inicio** de Windows (autoarranque al iniciar sesión, **sin admin**; creado en este PC). Logs en `agent/harvest.log` (gitignored). Setup en [agent/README.md](agent/README.md). Espeja `maps-ugc.ts`/`maps-url-matching.ts` (inline por ser .mjs). ⚠️ Frágil a cambios del DOM de Maps (registraría 0 casadas sin romper nada → ajustar selectores). Verificado E2E en el PC (lanza/consent/cosecha 190/cierra/código 0).

- **Botón web para gestores + modo escucha (2026-06-11).** Decisión: el PC de oficina es el "trabajador" para TODOS los gestores. Botón **"Sincronizar enlaces"** ([components/ui/MapsUrlSyncButton.tsx](components/ui/MapsUrlSyncButton.tsx)) en `/manager/resenas` (admin+gestor, junto a "Sincronizar") → `POST /api/sync/maps-urls` que **solo deja una señal** `action='harvest_requested'` en `audit_log` (buzón, **sin migración**; entity_id centinela `0000…`) y devuelve nº de pendientes. El servidor NO cosecha (necesita Chrome real). El agente corre en **modo escucha** (`agent/harvest-maps-urls.mjs --watch`, lanzado por `agent/watch-harvest.cmd` desde el acceso directo de Inicio): pasada inicial + sondea `audit_log` cada 60s (cosecha al detectar la señal) + pasada periódica cada `HARVEST_PERIOD_HOURS` (4). Si el PC está apagado al pulsar, la petición espera y se procesa al encender. Verificado E2E: señal insertada → detectada en ≤60s → cosecha. ⚠️ El agente debe estar corriendo en el PC (autoarranca al iniciar sesión; para arrancarlo sin reiniciar: doble clic en `watch-harvest.cmd`).

**Going-forward (resumen):** (a) cron diario Vercel cubre las ~5 destacadas/ficha (oficial, robusto); (b) el **agente** en el PC cubre el resto al iniciar sesión (recupera el backlog); (c) pegado manual para casos sueltos. Las anónimas/muy antiguas se quedan sin deep-link a propósito (la UI cae a la lista, sin regresión).

- **Estado al cierre 2026-06-11 (noche): 161/176 deep-links (~91%).** El emparejador del agente pasó a **unicode-aware** (`\p{L}\p{N}`; antes `[a-z0-9]` descartaba nombres en cirílico como "Светлана Костырко" → recuperó ~5). Las ~15 restantes son irrecuperables por nombre (transliteradas latino↔cirílico, muy antiguas fuera del tramo de feed, o borradas de Google) y se quedan con enlace a la **lista** (sin regresión). Mensaje del botón "Sincronizar enlaces" reescrito **sin mencionar el PC de oficina** (jerga interna). **Excel individual del comercial** (`/api/export/sales/[id]` + `sales-report.ts`) ya hyperlinkea al deep-link (`buildGoogleReviewUrl(mapsUrl, placeId)`); el **parte global** es agregado (totales por comercial, sin enlace por reseña — no aplica). El agente sigue en **modo escucha** en el PC (relanza al iniciar sesión).

### 4.55 Nomenclatura visible: "Responsable" = rol `office_director` (2026-06-11)

En la **UI** el rol `office_director` se muestra como **"Responsable"** (antes "Director"). ⚠️ Solo cambió **texto visible** (sidebar, títulos, botones, el selector "Responsable" al asignar un comercial, ★ en ranking/Excel, perfil, soporte, email ≤2★). **NO** cambió: el literal de rol `office_director`, la columna `director_id`, identificadores de código, la ruta `/directores` (sigue igual; nadie la teclea) ni nada de lógica. Regla mental: **"Responsable" en pantalla == `office_director` en código**. El sidebar del responsable se reorganizó en dos facetas claras (`OFFICE_DIRECTOR_SIDEBAR_GROUPS` en [Sidebar.tsx](components/layout/Sidebar.tsx)): **Mi oficina** (Comerciales · Verificación · Ranking del equipo) y **Mi actividad** (Mi enlace · Mis clientes · Mis reseñas); "Mis clientes" usa icono `Contact` para no confundirse con "Comerciales" (`Users`).

### 4.56 Fix: el `reviews_manager` no podía sincronizar (middleware, 2026-06-11)

`pathAllowedForRole` ([lib/supabase/middleware.ts](lib/supabase/middleware.ts)) no incluía `/api/sync` en la rama `reviews_manager` → al pulsar "Sincronizar" (reseñas) o "Sincronizar enlaces" el POST se redirigía a `/dashboard` (HTML) y el botón mostraba el engañoso "No se pudo sincronizar (HTTP 200)" (el fetch parseaba HTML como JSON). admin ya pasaba todo; sales/office_director ya tenían `/api/sync`. Fix: añadir `pathname.startsWith("/api/sync")` a la rama del gestor. Test de regresión en [lib/__tests__/route-access.test.ts](lib/__tests__/route-access.test.ts). (Los botones de sincronizar también ganaron iconos lucide: `MessageSquareText` reseñas, `Link2` enlaces; y el grupo derecho del Topbar queda `justify-content:flex-end` para no descolocarse con el feedback largo.)

### 4.57 Chequeo de salud diario por email (alertas de sistema, 2026-06-12)

Alertas proactivas para fallos **silenciosos** (cosas que no rompen la app pero nos dejan a ciegas). Distinto de las alertas instantáneas ≤2★ (mig 017, §4.29), que se mantienen intactas. **Solo va a admins, solo si hay algo que reportar (cadencia diaria). Sin migración** (consulta tablas existentes; el anti-spam lo da la cadencia).

**Cron** [/api/cron/health-check](app/api/cron/health-check/route.ts) — schedule `45 5 * * *` en [vercel.json](vercel.json) (tras sync BP `5` y enrich `30` → ve el estado del día ya actualizado). Mismo patrón `secretMatches()` (Bearer CRON_SECRET) que los otros crons; el middleware ya abre `/api/cron`. Carga datos en paralelo (service-client) → corre checks → si hay findings, manda el digest. `?dryRun=1` (con secret) devuelve los findings en JSON **sin enviar**. Audit: `health_check_run` (siempre) + `health_alert_sent`/`health_alert_failed`; entidad centinela `0000…` como `harvest_requested`.

**Checks puros** (sin I/O, testables) en [lib/monitoring/health-checks.ts](lib/monitoring/health-checks.ts) — tipo `HealthFinding {id, severity, title, detail, cta?}`, umbrales exportados:
- **`checkHarvestStalled`** — usa el latido del agente (`audit_log action='harvest_ran'`, ver abajo) + nº de deep-links pendientes (live). `pending=0` → null (las ~15 anónimas/antiguas irreparables no encienden alerta). Última pasada con `harvested===0` y pendientes>0 → **critical** (DOM de Maps roto, §4.54). Sin latido / última pasada >`HARVEST_NO_RUN_HOURS`(72h) → **warning** (PC apagado o agente caído; la edad prima sobre el DOM para no asumir DOM roto sobre un dato viejo).
- **`checkLocationsSyncStale`** — solo fichas `oauth_status='connected'`: `oauth_last_sync_error` no nulo → **critical**; sin sync nunca o >`LOCATION_SYNC_STALE_HOURS`(36h) → **warning**. CTA `/fichas`.
- **`checkVerificationBacklog`** — unmatched activas **de los últimos `VERIFICATION_BACKLOG_WINDOW_DAYS`(30) días** > `VERIFICATION_BACKLOG_THRESHOLD`(15) → **warning**. ⚠️ La ventana reciente es deliberada: excluye las ~72 huérfanas históricas de Places (§7) que nadie reclamará y que dispararían la alerta cada día.
- **`checkFailedNotifications`** — `notify_failed` sin `notify_retry_ok` posterior (misma lógica que `loadPending` de [/api/admin/notify-failed](app/api/admin/notify-failed/route.ts)) > 0 → **warning**.

**Email** [lib/email/notify-health.ts](lib/email/notify-health.ts) — `notifyHealthDigest({findings, to, appBase})`, patrón de `notify-low-rating` (BCC, `escapeHtml`, HTML+text), pero **sin branding por marca** (es alerta de sistema). Subject `⚠️ ReseñaHub · N incidencias…`; findings ordenados critical-primero (`sortFindings`), cada uno con su CTA al área de la app. Destinatarios = admins activos (role='admin', email con fallback a `auth.users`, dedupe; loader local en el route, espejo de `getResponderEmails`).

**Latido del agente** [agent/harvest-maps-urls.mjs](agent/harvest-maps-urls.mjs) — `runPass` ahora escribe **siempre** una entrada `harvest_ran {harvested, matched, pending}` al final de cada pasada (aunque case 0), salvo en la salida temprana "nada pendiente / sin fichas con place_id" (escribir un `harvested:0` ahí sería un falso "DOM roto"). `harvested` = total de reseñas extraídas del DOM. ⚠️ **El PC de oficina debe hacer `git pull`** para emitirlo (arranca solo al iniciar sesión; el siguiente arranque tras el pull ya lo trae). Sin el latido, `checkHarvestStalled` solo detectaría "no corrió", no "DOM roto".

**Tests** [lib/monitoring/__tests__/health-checks.test.ts](lib/monitoring/__tests__/health-checks.test.ts) — los 4 checks en sus casos límite + `sortFindings`. **Ampliar a futuro**: añadir un `check*` puro nuevo + sumarlo en el route es todo lo que hace falta (la base no se toca).

---

## 5. Setup en otro Mac

`.env.local` está en `.gitignore` — no viaja. En cada Mac:

1. `git clone https://github.com/acastillocanton/rese-as-hub.git && cd rese-as-hub && npm install`
2. Crear `.env.local` desde `.env.example` con:
   - `NEXT_PUBLIC_SUPABASE_URL=https://zejwmznusszqlwhevaqv.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (formato `sb_publishable_*`) — Supabase Dashboard → Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_*`) — misma pantalla.
   - `CRON_SECRET` — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
   - `BREVO_SMTP_USER` / `BREVO_SMTP_PASS` / `BREVO_FROM_EMAIL` para emails transaccionales reales en dev.
   - `GOOGLE_PLACES_API_KEY` (formato `AIza…`) para que el cron de Places API funcione en local. Crear en Google Cloud Console → proyecto `resenas-inseryal` → Credentials. Ver §4.18.
   - Opcionales (integración Business Profile cuando llegue cuota): `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI`.
3. `npm run dev` → http://localhost:3000.
4. Login: `/login` con `alejandro.castillo@inseryal.es`, magic-link al email.

---

## 6. Reglas críticas

### Always do
- Validar inputs externos en el borde (Zod en server actions, `isValidSlug` / `isSafeNext` en route handlers).
- Parametrizar consultas vía Supabase query builder.
- Aplicar RLS en toda tabla con datos sensibles. `location_secrets` tiene RLS sin políticas — solo service-role.
- Usar `createServiceClient` **solo** desde código server-only. Nunca importarlo desde un componente cliente.
- Usar `recordAudit()` para escribir en `audit_log`. Nunca insert directo desde cookie-context (§4.6).
- `npm run typecheck` antes de cerrar tarea. `npm test` también si has tocado `lib/matching/` o `lib/date-range`.
- Actualizar `spec.md` cuando una decisión cambie.

### Ask first
- Migraciones de DB nuevas (`supabase/migrations/00X_*.sql`).
- Cambios al modelo de matching (algoritmo, umbrales, ventana temporal).
- Cambios al sidebar / IA de las pantallas.

### Never do
- Commitear secretos. `.env*.local` está en `.gitignore`.
- Exponer service-role a un componente cliente.
- Devolver `oauth_refresh_token` ni `location_secrets` desde un endpoint accesible al usuario.
- Confiar en validación cliente como límite de seguridad.
- Redirect externo desde query param sin pasar por `isSafeNext`.
- Tocar `_design_package/` (referencia de diseño, no código fuente).
- Quitar `turbopack.root` ni `outputFileTracingRoot` de `next.config.ts` (§4.5).
- Usar clases `sales-*` fuera de `app/(sales)/` o `MobileTabBar.tsx` (§4.14).
- Quitar los prefijos `places:` / `manual:` del `google_review_id` (§4.17) — rompería la idempotencia.
- Añadir `overflow` (hidden/auto) a [`Frame`](components/layout/Frame.tsx) — rompe el `position:sticky` del sidebar y el footer (Soporte/Ayuda) deja de quedar fijo (§4.45).

---

## 7. Estado real de Supabase

- **Proyecto**: `zejwmznusszqlwhevaqv.supabase.co`. Migraciones **001-027 aplicadas** (025 y 026 el 2026-06-10; 027 el 2026-06-11; 024 ver §4.48). **027 = alias de slug (`previous_slug`)**: `ALTER TABLE profiles ADD COLUMN previous_slug text` + índice único parcial + reescritura de `profiles_self_update` congelando `previous_slug` (regla §4.36 — sin esto un sales podría secuestrar el enlace viejo de otro). Renombrado one-shot de 33 productores a nombre+primer-apellido aplicado el 2026-06-11 (`audit_log action='slug_renamed'`, ver §4.53). **028 = soft-delete automático** (`ALTER TABLE reviews ADD COLUMN missing_since timestamptz`, ver §4.20) — ⚠️ **PENDIENTE de aplicar en Supabase** (hasta entonces el reconcile del cron BP falla en su try/catch propio sin afectar al sync). **026 = tope de reseñas bonificables por productor**: `ALTER TABLE profiles ADD COLUMN commission_cap int DEFAULT 5` + backfill de productores a 5 + reescritura de `profiles_self_update` congelando `commission_cap` (regla §4.36). NULL = sin tope. El € de comisión pasa a `min(counted, cap) × rate` (ver §4.49). **025 = el `reviews_manager` puede ESCRIBIR sobre `reviews`** (bug en prod): el gestor NUNCA tuvo policy de UPDATE sobre `reviews` (solo `reviews_manager_select` desde mig 002; `reviews_admin_all` es solo para admin). La mig 016 asumió por error que "reviews_manager y admin no cambian", pero la paridad RLS nunca existió → reasignar/confirmar/rechazar/markRemoved/restore (y `saveReviewReply`/`clearReviewReply` de mig 024) fallaban en silencio para el gestor (UPDATE cookie-client bloqueado por RLS → 0 filas, error=null → la acción devolvía ok:true sin guardar). 025 añade `reviews_manager_all` (`for all`, paridad real con admin), manteniendo defensa en profundidad por RLS en vez de degradar a service-client. **023 = soporte interno (helpdesk)**: 3 tablas (`support_conversations`, `support_messages`, `support_read_receipts`) + RLS por rol + función `support_unread_count()` + índices (ver §4.45). Anteriores: **001-022 aplicadas** (021/022 verificadas empíricamente en prod 2026-06-01: un sales recibe 403 al intentar PATCH de columnas congeladas, 200 en campos no sensibles). **022 = addendum de 021**: congela también `department` y `language` en `profiles_self_update` (un sales podía auto-cambiarse el departamento por API → afecta a la hoja del Excel). Mismo patrón `is not distinct from`. **021 = blindaje de `profiles_self_update`** (auditoría): la policy original solo congelaba `role`, así que cualquier usuario podía editarse por API directa su propia `commission_rate`/`monthly_goal`/`status`/`location_id`/`director_id` (fraude de comisión). 021 reescribe el `WITH CHECK` congelando esas columnas (comparación `is not distinct from` contra el valor actual) y solo permite la transición `status` `invited→active` (el flip de `/auth/confirm`). No afecta a admin/manager/director (sus UPDATE pasan por sus policies permisivas en OR). Ver §4.36. **020 = tarifa de comisión por reseña**: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_rate numeric(8,2)` (nullable, sin default; €/reseña por productor para el importe estimado del periodo de comisión 20→20; sin RLS nueva — escritura por las policies de update de profiles existentes; ver §4.35). **019 = plantillas de mensaje personalizadas**: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS message_templates jsonb` (JSONB nullable keyed por `MessageTemplateId`, shape anidado `{ [id]: { label?, body? } }` — el comercial personaliza nombre y/o cuerpo; sin RLS nueva, escritura server-only por service-client; ver §4.31). **018 = objetivo mensual por defecto bajado a 5**: `ALTER TABLE profiles ALTER COLUMN monthly_goal SET DEFAULT 5` + `UPDATE profiles SET monthly_goal = 5 WHERE monthly_goal = 50` (bulk update de los 51 perfiles existentes aplicado 2026-06-01). **017 = alertas tempranas ≤2★**: añade `reviews.low_rating_alerted_at timestamptz` + índice parcial `reviews_low_rating_pending_alert_idx` (ver §4.29). **016 = verificación abierta a todos los roles**: helper `current_user_location()` + policy SELECT permissive `reviews_unmatched_location_select` para que sales/director vean unmatched de su `profiles.location_id` + policy UPDATE estricta `reviews_sales_claim_update` con WITH CHECK que solo deja al sales pasar unmatched → counted con `sales_id = auth.uid()` (ver §4.24). **015 = anti-fraude**: añade `reviews.is_duplicate boolean` + backfill histórico marcando como duplicadas todas menos la primera por `google_created_at` dentro de cada `client_id` + índice parcial `reviews_active_principal_idx`. Las queries de KPI/Excel filtran `is_duplicate=false`; los listados muestran todas con badge "Duplicada" (ver §4.23). **014 = multi-marca**: enum `brand_enum` + columna `locations.brand` con default `'inseryal'` + backfill por `name ilike 'Marina d''Or Construcciones%'` (ver §4.22). 007 = índices compuestos en `reviews`. 008 = `actor_id` + policy `audit_log_self_insert`. 009 = enum `review_source_enum` (`business_profile`/`places_api`/`manual`) + columna `source` en `reviews`. 010 = columna `removed_at` + índice parcial + view `reviews_active`. **011 = añade valor `'office_director'` al enum `role_enum`** (aislado por la limitación 55P04 de Postgres: un nuevo valor de enum no puede usarse como literal en la misma transacción en que se añadió). **012 = resto del rol `office_director`**: constraint `role_requires_location`, helper `current_office_location()` y policies RLS para director sobre `locations`, `profiles` `role='sales'`, `reviews`, `clients`, `share_links`. **013 = el office_director pasa de scope por location a scope por equipo** (`profiles.director_id`): nueva columna auto-referencial + reescritura de policies de profiles/reviews/clients/share_links a `director_id = auth.uid()`. La policy de `locations` se mantiene por `location_id` (acceso a su ficha sigue por oficina). Permite varios directores en la misma ficha, cada uno con su equipo (p.ej. uno por idioma en Internacional).
- **URL Configuration**: Site URL = `https://resenas.marinadorconstrucciones.com`; Redirect URLs incluyen `http://localhost:3000/**` + URL prod con `/**`.
- **Email Templates**: Magic Link con `type=email`, Invite con `type=invite` (ver §4.1).
- **Storage**: bucket público `avatars` con 3 policies (insert/update/delete propio en `{user_id}/`). Avatar upload vía server action con service-role en [`(profile)/perfil/actions.ts`](app/(profile)/perfil/actions.ts) (bypasea RLS por simplicidad).
- **Usuarios (estado 2026-05-25 — alta masiva de comerciales y directores reales)**:
  - 2 admins activos: Alejandro Castillo + Rafael Ibáñez (`@inseryal.es`).
  - 2 gestores activos: Bel (`bel.bernete@inseryal.es`) + José González Pérez (`jose.gonzalez@inseryal.es`).
  - **11 directores de oficina** (1 activo: Roberto García Cuellar; 10 invitados — María Jesús Lozano, Carmen Lopez, Fernando Taño, Korina Unguryanu, Almudena Martinez, Jose Rubio Mateos, Adriana Mihalascu, Georgina Lawless, Monika Kubiak, Pavel Kurlaev).
  - **40 comerciales invitados** distribuidos por departamento: nacional 19, internacional 14, castellón 5, valencia 6. Status `invited` hasta que cada uno confirme su magic-link → flip automático a `active`.
  - **Reparto total productivo (sales + office_director, no archivados): 51** — nacional 21, internacional 16, castellón 7, valencia 7.
  - **`profiles.joined_at` poblado con fechas reales** desde el Excel `Reseñas MARZO.xlsx` + screenshots Castellón/Valencia (45 de 51) vía `scripts/update-joined-at.mjs` (gitignored — contiene datos reales). 6 perfiles sin fecha confirmada mantienen el `joined_at` del seed: Adina Coman Vasilescu, Alicia Seroczynska, Amber Spurka, Anton Klymenko (internacional); Cristina García Álvarez, Victor Clemente Moro (nacional).
  - **1 cliente** real cargado (el resto pendiente del primer login de cada comercial).
- **7 fichas**: 5 Inseryal (Oropesa, Pardiñas, Príncipe de Vergara, Leganés, Chamberí) + 2 Marina d'Or Construcciones (Castellón, Valencia). **Las 7 conectadas vía OAuth Business Profile** desde 2026-06-10 (`oauth_status='connected'`, cuenta `accounts/111197444117937021993`, tokens en `location_secrets`, `google_location_resource` = recurso completo `accounts/.../locations/...`). Pill "Business Profile" (verde) en dashboard y `/fichas`. Sincronizan vía el cron BP (fuente única going-forward, §4.50). Places API apagado.
- **Reseñas reales en BD**: 72 con `source='places_api'` desde 2026-05-23, todas en estado `unmatched` (no había share_links coincidentes con sus fechas históricas porque los comerciales aún no han activado su acceso). Visibles en `/resenas/verificacion?state=unmatched`. Cuando se activen y empiecen a generar share_links, las reseñas que entren en la ventana 48h se atribuirán automáticamente.

Antes de actuar sobre datos verificar con `curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/<tabla>?select=... -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`. La BD evoluciona.

---

## 8. Backlog v2

> V1 cerrada (ver §3). Lo siguiente. Features concretas de v2 se irán definiendo conforme el negocio las pida; por ahora aquí quedan los pendientes técnicos y las open questions de spec.md que no se cerraron en v1.

1. **Cuando llegue Google Business Profile API** (caso `5-5855000041022`; allowlist **reenviado bien el 2026-06-09** tras descubrir que el anterior estaba rechazado por dominio del solicitante, re-check 2026-06-23 — ver §4.26): ver el **checklist completo consolidado en §4.26** (bloques A-G: activación OAuth, dedup one-shot, reactivar soft-delete automático, deep-link a reseña concreta, estrategia de los dos crons, actualizaciones de docs/UI, verification de Google, **Bloque G = activar publicación de respuestas por API §4.48**). Mientras tanto el cron de Places API (§4.b) sigue trayendo reseñas reales.
2. **Polish técnico restante**:
   - Seed más realista para dev (los E2E specs usan datos de prueba reales contra Supabase; cuando crezca el cubrimiento, considerar un proyecto Supabase de pruebas).
   - Ampliar E2E: sales-flow (crear cliente, compartir enlace) cuando haya un comercial fijo de pruebas en BD; cron con fixture del Google API.
   - Refactor de modal backdrops a componente Dialog compartido con focus trap + Escape handler (hoy lint warnings, no errors).
3. **Ajustes globales** (`/ajustes`): la ruta existe pero está **oculta del sidebar admin** hasta tener contenido (era un stub `ComingSoon` que confundía). Cuando se implemente alguna de las funcionalidades planeadas (reglas de matching configurables, plantilla del email de invitación, schedule del cron, plantilla del mensaje de WhatsApp), añadir de vuelta el item `{ id: "settings", label: "Ajustes", href: "/ajustes", icon: Settings }` en `ADMIN_SIDEBAR_GROUPS` de [`components/layout/Sidebar.tsx`](components/layout/Sidebar.tsx) (junto a "Fichas Google"). Sigue siendo solo-admin por middleware.
4. **Open questions abiertas en `spec.md` §9** (decisiones de producto pendientes):
   - #1 Dominio definitivo (`reseñahub.es` vs `resenas.inseryal.es`).
   - #2 Branding final (logo, paleta exacta, tipografía).
   - #3 Integración CRM externo para alta de clientes (hoy manual).
   - #6 Política de retención (¿borrar share_links >90 días? ¿reseñas archivadas?).
   - #7 Alertas tiempo real al admin sobre reseñas ≤3★.
   - #8 Encriptar `oauth_refresh_token` en reposo (Supabase Vault / pgcrypto).
5. **Soporte interno — pendientes**:
   - ✅ **Acceso a Soporte en mobile (cerrado 2026-06-11)**: tarjeta "Ayuda y soporte" en `/perfil` (links a `/soporte` + `/ayuda`, badge de no-leídos) + punto de aviso azul en `MobileProfileAvatar`. Verificado E2E con cuenta de comercial en viewport móvil. Detalle en §4.45.
   - Filtros en la bandeja del respondedor (por categoría, estado, ficha).
   - Búsqueda en conversaciones.
   - Auto-cierre de conversaciones sin actividad (vía cron diario existente).
   - Notas internas visibles solo entre responders.
   - Respuestas predefinidas (templates para preguntas frecuentes).
   - Asignación de conversaciones a un respondedor concreto (`assigned_to`).

---

## 9. Mantenimiento

Cada vez que termine una tanda significativa:
1. Actualizar §3 con lo nuevo (no añadir prosa: usar bullets cortos).
2. Si surge un workaround nuevo, entrada en §4.
3. Si la BD cambia (usuarios, fichas, migraciones), actualizar §7.
4. Si se cierran open questions de la spec, marcarlas en `spec.md`.
5. Commit + push.

Los `MEMORY.md` de `~/.claude/projects/...` son **locales a cada Mac**, no se versionan. La continuidad cross-Mac es este `CLAUDE.md` + `spec.md`.
