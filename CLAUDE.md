# CLAUDE.md

Este archivo lo lee Claude Code automáticamente al abrir el repo. Vive en git → viaja entre Macs → todas las sesiones arrancan con el mismo contexto.

> **Fuente de verdad del producto**: [`spec.md`](spec.md). Si entra en conflicto algo de aquí con la spec, gana la spec.

---

## 1. Resumen

**ReseñaHub** — app interna single-tenant para **Inseryal by Marina d'Or**. Sustituye el parte semanal de reseñas que se compilaba a mano en Excel.

Cuatro roles:
- **admin** — gestor global. Hoy 2 personas: Alejandro Castillo + Rafael Ibáñez (`@inseryal.es`).
- **office_director** (director de oficina, migraciones 011 + 012 + 013) — rol **DUAL**: (a) **admin scoped a SU EQUIPO** (`profiles.director_id`); (b) **comercial productor** con su propio `/c/{slug}`, clientes, reseñas atribuidas (igual que un sales). Cada director gestiona un subset de comerciales dentro de una ficha y a la vez vende él mismo. Una location puede tener varios directores, cada uno con su equipo. Tiene los mismos campos productivos que un sales (`department`, `language` si internacional, `monthly_goal`). Aparece en el leaderboard y en el parte Excel marcado con "★" para distinguirlo. Sobre SU ficha hace todo lo que admin (conectar/desconectar OAuth, editar Place ID — `/fichas` sigue scoped por `location_id`). Sidebar: dos grupos "Mi panel" (producer) + "Mi oficina" (gestor). NO accede a `/gestores`, `/ajustes` ni `/directores`. Solo el admin general invita/edita/elimina directores desde `/directores` (y el reviews_manager también, por paridad con sales).
- **sales** (comercial) — genera enlaces personalizados por cliente, ve sus reseñas, su ranking. Puede tener un `director_id` asignado (su responsable directo). Si es null, queda en el pool del admin/reviews_manager. Desde mig 016 también accede a `/resenas/verificacion` con permiso acotado a "Reclamar" reseñas huérfanas (unmatched) de SU ficha (atribuírselas a sí mismo + un cliente propio o nuevo). No puede confirmar/rechazar/reasignar/eliminar.
- **reviews_manager** (Bel) — comparte vista con admin en Dashboard y comerciales, **con plenos permisos de administración sobre el rol sales** (invitar / editar / reenviar acceso / eliminar — incluye asignar/reasignar `director_id`). Adicional: `/manager/resenas`, `/manager/export` y `/resenas/verificacion` (paridad con admin tras mig 016: confirmar/rechazar/reasignar/markRemoved/restore). NO accede a `/gestores`, `/directores`, `/fichas`, `/ajustes`.

**Flujo**: comercial comparte `resenas.marinadorconstrucciones.com/c/{sales-slug}/{client-slug}` → cliente cae directo en "Escribir reseña" en Google (302) → dos crons diarios (Google Places API + Google Business Profile API) traen las reseñas → algoritmo atribuye al comercial por ventana temporal + nombre del cliente.

**Stack**: Next.js 15.5.18 App Router + Turbopack · TypeScript strict + `noUncheckedIndexedAccess` · Supabase (Postgres + Auth + RLS) · Google Places API (New) v1 con API key + Google Business Profile API con OAuth · Brevo SMTP (vía Supabase para magic-links/invites; vía Nodemailer en [lib/email/brevo.ts](lib/email/brevo.ts) para notificaciones transaccionales — claves SMTP independientes) · Vercel Hobby + crons diarios `0 5 * * *` Places y `5 5 * * *` Business Profile UTC · ExcelJS (dynamic import) · qrcode.react · Zod · lucide-react · Vitest para tests unit.

**Producción**: [`https://resenas.marinadorconstrucciones.com`](https://resenas.marinadorconstrucciones.com). DNS en SiteGround.

---

## 2. Comandos

```bash
npm install            # primera vez en una máquina nueva
npm run dev            # dev en http://localhost:3000 (Turbopack)
npm run build          # build producción (verifica tipos)
npm run typecheck      # tsc --noEmit — pasar antes de cerrar tarea
npm run lint           # next lint (eslint-config-next + jsx-a11y/recommended)
npm test               # Vitest unit tests (126 tests: matcher + date-range + Places + leaderboard + branding + messaging + duplicate-detection + verification-gating + review-url)
npm run test:watch     # Vitest en modo watch
npm run test:e2e       # Playwright happy paths (login + admin nav). Primera vez: npx playwright install --with-deps chromium
npm run test:e2e:ui    # Playwright en modo UI interactivo
```

Migraciones SQL: ejecutar en Supabase Dashboard → SQL Editor en orden numérico (`001_*`, `002_*`, …). Las migraciones son `Ask first` (ver §6).

---

## 3. Estado del proyecto

> 🏁 **V1 cerrada el 2026-05-26**. Cubre todo el flujo end-to-end: alta de comerciales/directores/gestores, generación de enlaces, sincronización vía Places API (Business Profile esperando cuota), atribución automática, panel del comercial con mobile + ranking, export Excel del gestor, soft-delete, multi-marca, polish (loading states + a11y + E2E Playwright). Próxima iteración → v2 (sin features definidas todavía; ver §8 Backlog).
>
> Producto live y trayendo reseñas reales desde **2026-05-23** vía Google Places API (vía de respaldo mientras esperamos cuota de Business Profile API — caso `5-5855000041022`, ETA ~2026-06-04). El cron oficial de Business Profile sigue activo en paralelo; cuando Google apruebe, retomará automáticamente sin redeploy.

| Fase | Estado |
|---|---|
| 1 · Foundation (schema + RLS + auth + landing pública `/c/...`) | ✅ |
| 2 · Admin (`/dashboard`, `/comerciales`, `/gestores`, `/fichas`, `/resenas/verificacion`) | ✅ |
| 3 · Sales desktop (`/panel`, `/panel/enlace`, `/panel/resenas`, `/clientes`, `/clientes/[slug]`) | ✅ |
| 3.b · Sales mobile (ver subsección) | ✅ |
| 4 · Google Business Profile sync + matching | ⚠️ código listo + hardened, esperando cuota Google |
| 4.b · Places API fallback (legacy + sort=newest) | ✅ trayendo reseñas reales en prod desde 2026-05-23 |
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
| `/panel/ranking` mobile para el rol sales (ranking de su equipo) | ✅ (2026-05-26) |
| Loading states (`loading.tsx` por route group + `<Skeleton>`) | ✅ (2026-05-26) |
| A11y: `eslint-plugin-jsx-a11y` activo + arreglos puntuales | ✅ (2026-05-26) |
| Tests E2E Playwright (setup + login + admin-nav specs) | ✅ (2026-05-26) |
| Edición de teléfono en ficha del comercial (paridad con director) | ✅ (2026-05-26) |
| Breadcrumbs enlazados a la sección padre en sub-páginas | ✅ (2026-05-26) |
| **🏁 V1 cerrada** | **2026-05-26** |
| Anti-fraude: marcado de reseñas duplicadas por client_id (mig 015) | ✅ (2026-05-26) |
| v2 · Verificación abierta a todos los roles (mig 016) | ✅ (2026-05-26) |
| v2 · Link a ficha de Google en cada listado de reseñas | ✅ (2026-05-26) |

### Vista mobile (Fase 3.b + extensión director)
Roles con vista mobile (`≤767px`): **sales** (fase 3.b) y **office_director** (extensión migración 011). Admin y reviews_manager siguen desktop-only por diseño (uso en oficina). Implementado con **CSS media queries puras** (sin hooks JS, sin route group duplicado, sin flicker SSR) con clases prefijadas `m-*` al final de [`app/globals.css`](app/globals.css).

Originalmente las clases eran `sales-*` cuando solo el comercial tenía mobile. Cuando el director ganó mobile también, se renombraron a `m-*` (mobile) — son helpers responsive role-agnósticos. La decisión de pintar `MobileTabBar` + ocultar `Sidebar` es lo único role-conditional y vive en cada layout.

Chrome mobile (sales + director):
- Sidebar 232px oculto via `.m-hide-mobile`.
- [`<MobileTabBar />`](components/layout/MobileTabBar.tsx) fija inferior con 4 tabs, iconos lucide, `padding-bottom: env(safe-area-inset-bottom)`. Acepta un prop `tabs: MobileTab[]` y exporta dos constantes:
  - `SALES_MOBILE_TABS`: Panel · Enlace · Reseñas · Ranking (consumida por [(sales)/layout.tsx](app/(sales)/layout.tsx)).
  - `DIRECTOR_MOBILE_TABS`: Inicio · Comerciales · Reseñas · Mi ficha (consumida por [(admin)/layout.tsx](app/(admin)/layout.tsx) y [(manager)/layout.tsx](app/(manager)/layout.tsx) cuando el rol es `office_director`).
- Para sales: "Clientes" no está en la tab bar (fidelidad al mockup). Se accede desde card mobile-only "Mis clientes" en `/panel`.
- Para director: `/manager/export` y `/perfil` se acceden navegando desde el resto de pantallas (no caben 5 tabs).
- [`/panel/ranking`](app/(sales)/panel/ranking/page.tsx) = ranking del propio equipo del comercial (sales con su mismo `director_id`, o pool de huérfanos si su director_id es null). Cards verticales con [`<LeaderboardCardList>`](components/ranking/LeaderboardCardList.tsx); la card del propio comercial se destaca con borde tinta y badge "Tú". RLS se sortea con service-role server-side filtrando por `director_id` calculado desde la sesión (no es query-param). Implementado 2026-05-26.

Clases mobile (todas `!important` para vencer al inline `style={{}}` desktop): `m-hide-mobile` / `m-hide-desktop` / `m-mobile-only`, `m-page-pad`, `m-grid-hero` / `m-stats-3` / `m-stats-4` / `m-qr-grid` / `m-detail-grid`, `m-ring-row`, `m-review-row` + `m-review-pill`, `m-rangepicker-popover`, `m-topbar-compact` (activada con prop `compact` de `Topbar`).

`ClientRowItem` mantiene dos sub-layouts coexistentes (desktop grid 5 cols + mobile card vertical) compartiendo estado. Las tablas del director en `/comerciales` y `/fichas` usan `overflowX: auto` + `minWidth: 720-920px` para permitir scroll horizontal en mobile (acabado "aceptable", no se reescriben a cards).

### Fase 4 · Google (detalle)
Código completo en [`lib/google/business-profile.ts`](lib/google/business-profile.ts) (cliente OAuth + reviews v4 con `fetchWithRetry` para 429/5xx), [`lib/matching/attribute-review.ts`](lib/matching/attribute-review.ts) (ventana 48h + similitud Unicode-aware; thresholds 75/40, **modo `anonymous_author` cuando Google no devuelve displayName: usa ventana corta 4h y solo asigna `pending` si hay UN único candidato**), [`/api/cron/sync-google-reviews`](app/api/cron/sync-google-reviews/route.ts) (paginación + early-exit + idempotencia por `unique (location_id, google_review_id)` + **lock optimista contra solapamiento** + **email notificación en batch con `Promise.allSettled` al final** + `.limit(10000)` defensivo en share_links), [`/api/google/oauth/*`](app/api/google/oauth/) (consent + token swap + state CSRF), [`/fichas/[id]/conectar`](app/(admin)/fichas/[id]/conectar/page.tsx) (UI selección). Email transaccional al comercial cuando entra `counted` en [`lib/email/notify-new-review.ts`](lib/email/notify-new-review.ts) con `escapeHtml` aplicado a todo input externo. Endpoint admin [`/api/admin/notify-failed`](app/api/admin/notify-failed/route.ts) (GET lista pendientes, POST reintenta) para emails de notificación que fallaron — registra `notify_retry_ok` / `notify_retry_failed` en `audit_log`.

OAuth flow validado E2E. Único pendiente: cuota Google. Mientras tanto las APIs `mybusiness*` devuelven 429 RESOURCE_EXHAUSTED.

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
- POST autenticado por cookie de sesión (no por CRON_SECRET).
- Admin / reviews_manager sin body → todas las fichas; con `{ location_id }` → solo esa.
- Sales → ignora body; sincroniza únicamente su `profiles.location_id`.
- Botón [`<SyncNowButton />`](components/ui/SyncNowButton.tsx) reutilizable en `/fichas` (admin: global + por fila), `/manager/resenas` (gestor) y `/panel` (comercial).

**Importador manual** ❌ ELIMINADO 2026-05-23: existía la pantalla `/manager/resenas/importar` para meter reseñas a mano, pero el cron horario + el botón "Sincronizar ahora" cubren el 99% de casos. Se eliminó para simplificar y evitar el riesgo de reseñas inventadas. El enum `review_source_enum` mantiene el valor `'manual'` por compatibilidad pero ya no entra ningún registro nuevo con esa fuente. Si en el futuro hace falta, está en el historial git de la rama `feature/places-fallback` (commit `6aaae66`).

**Migración 009 — columna `source` enum**:
- `business_profile` (default) | `places_api` | `manual` (legacy, ver arriba).
- Prefijo en `google_review_id`: raw para Business Profile, `places:{id}` para Places. Evita colisiones del `unique (location_id, google_review_id)`.
- ⚠️ **Duplicados conocidos**: la misma reseña puede entrar como `places_api` y luego como `business_profile` cuando llegue la cuota (los IDs no están garantizados a coincidir). Pendiente: script de dedup one-shot tras primer run exitoso de Business Profile (preferir `business_profile` autoritativo, borrar clones `places_api` por match de `author_name + rating + |google_created_at - X| < 1h`).

**Tests**: 20 del cliente Places API (`lib/google/__tests__/places.test.ts`) + 5 del helper de reconciliación.

### Fase 5 · Gestor (detalle)
Decisión: el gestor unifica vista con admin en lugar de un universo paralelo `/manager/*`. Comparte `/dashboard` y `/comerciales/*` con plenos permisos sobre sales. Pantallas propias: [`/manager/resenas`](app/(manager)/manager/resenas/page.tsx) y [`/manager/export`](app/(manager)/manager/export/page.tsx) (.xlsx con detalle + resumen dashboard). Gating: helper [`assertCanManageSales()`](app/(admin)/comerciales/actions.ts) en las 4 acciones de comerciales. RLS: migración [`005_manager_sales_admin.sql`](supabase/migrations/005_manager_sales_admin.sql) — `with check` impide escalar un sales a admin/manager.

### Centro de ayuda (`/ayuda`) — manual del comercial

Pantalla [`app/(profile)/ayuda/page.tsx`](app/(profile)/ayuda/page.tsx) accesible a los **tres roles** desde el sidebar (item "Ayuda" abajo del todo, encima del avatar, icono LifeBuoy). Manual de 10 secciones con tabla de contenidos sticky, callouts azules/amarillos, FAQ desplegable y 9 capturas reales.

- Capturas en [`public/help/`](public/help/) (`01-email-magic-link.png` ... `09-perfil.png`) — 6 generadas vía Playwright headless logueado como Comercial Demo en producción; `06-flujo-atribucion.png` es un diagrama generado con Pillow.
- README en [`public/help/README.md`](public/help/README.md) con la lista exacta de archivos esperados.
- Componente [`<HelpFigure />`](components/help/HelpFigure.tsx) con doble función: placeholder cuando la imagen no existe (para añadir capturas a posteriori) **y lightbox** al hacer click (overlay fullscreen, cierre con Esc, clic fuera o botón ×).
- Permitido en middleware (`/ayuda` siempre accesible). KPI "Ficha más activa" en `/manager/resenas` se sustituye dinámicamente por "% con comentario" cuando hay filtro de ficha aplicado (PR #7).

**Importador manual ❌ eliminado 2026-05-23** (PR #9): existía `/manager/resenas/importar` para meter reseñas a mano, pero el cron diario + cron horario GitHub + botón "Sincronizar ahora" cubren todos los casos. Se eliminó para limpiar UI y evitar reseñas inventadas. El enum `review_source_enum` mantiene `'manual'` por compatibilidad pero ya no entran filas nuevas. Resucitable desde commit `6aaae66` si hace falta.

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

⚠️ **Duplicados conocidos**: cuando llegue la cuota de Business Profile, las mismas reseñas pueden entrar dos veces (una con `places:` y otra con el `reviewId` raw de Business Profile) porque los IDs de cada API no coinciden. El `unique (location_id, google_review_id)` impide colisión técnica, pero visualmente verás duplicados en `/manager/resenas`. Resolución: script one-shot tras el primer run exitoso de Business Profile que preferirá `business_profile` autoritativo y borrará los clones `places_api` por match de `author_name + rating + |google_created_at - X| < 1h`. No urgente — el sistema funciona con duplicados temporales.

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

⚠️ **Detección automática DESACTIVADA**: `lib/google/sync-places.ts` tiene una función `reconcileRemoved` (testada y exportada como `__test_reconcileRemoved`) pero **NO se llama desde el flujo principal**. Razón: Google Places API con `reviews_sort=newest` no es consistente entre llamadas — distintos frontales pueden devolver conjuntos ligeramente distintos del mismo Place ID, causando falsos positivos (marcar como eliminada una reseña que sigue existiendo y reaparece en el siguiente sync). En el primer despliegue de la lógica automática se marcaron 2 reseñas reales como eliminadas; se restauraron manualmente y se desactivó la lógica.

**Reactivar cuando llegue Business Profile API**: ese endpoint pagina y es autoritativo. Considerar también una capa de `last_seen_at` con threshold de N runs antes de marcar como removed, para evitar inconsistencias temporales.

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
Vercel Hobby solo permite cron diario. Places API no pagina → con 1 sync/día perdemos reseñas en fichas activas. Workflow [`.github/workflows/sync-places-hourly.yml`](.github/workflows/sync-places-hourly.yml) dispara `/api/cron/sync-places-reviews` cada hora (minuto 30, 06-23 UTC). Requiere dos secrets en repo GitHub:
- `APP_URL` = `https://resenas.marinadorconstrucciones.com`
- `CRON_SECRET` = mismo valor que en Vercel

Si el endpoint devuelve != 200, el workflow falla y GitHub manda email al maintainer. Botón "Run workflow" disponible en la pestaña Actions para disparos a demanda.

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

⚠️ **No pasar todas las acciones a service-client** "por simplicidad" — perderíamos la red de seguridad RLS para sales. El WITH CHECK de `reviews_sales_claim_update` es lo único que impide que un sales con código malicioso/bug se atribuya reseñas que no son suyas. Si en el futuro hace falta uniformar, primero diseñar policies UPDATE permissivas para director sobre unmatched y luego sí.

### 4.25 Link a ficha pública de Google en cada reseña

Cada listado de reseñas tiene un mini-link "Ver en Google" (icono `ExternalLink` con borde) que abre en nueva pestaña la **ficha pública de Google con el panel de reseñas desplegado** (`https://search.google.com/local/reviews?placeid=XXX`). Útil para verificar contexto, ver si tiene respuesta del propietario, o leer el texto en formato Google.

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

**Pendiente cuando llegue Business Profile**: ampliar el helper a `buildGoogleReviewUrl(placeId, googleReviewId, source)` y switchear entre URL a lista (Places) y URL a reseña concreta (Business Profile). El call site no cambia — se sigue pasando `placeId` desde el componente, simplemente añadimos `googleReviewId` y `source` desde la review.

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

---

## 7. Estado real de Supabase

- **Proyecto**: `zejwmznusszqlwhevaqv.supabase.co`. Migraciones **001-016 aplicadas**. **016 = verificación abierta a todos los roles**: helper `current_user_location()` + policy SELECT permissive `reviews_unmatched_location_select` para que sales/director vean unmatched de su `profiles.location_id` + policy UPDATE estricta `reviews_sales_claim_update` con WITH CHECK que solo deja al sales pasar unmatched → counted con `sales_id = auth.uid()` (ver §4.24). **015 = anti-fraude**: añade `reviews.is_duplicate boolean` + backfill histórico marcando como duplicadas todas menos la primera por `google_created_at` dentro de cada `client_id` + índice parcial `reviews_active_principal_idx`. Las queries de KPI/Excel filtran `is_duplicate=false`; los listados muestran todas con badge "Duplicada" (ver §4.23). **014 = multi-marca**: enum `brand_enum` + columna `locations.brand` con default `'inseryal'` + backfill por `name ilike 'Marina d''Or Construcciones%'` (ver §4.22). 007 = índices compuestos en `reviews`. 008 = `actor_id` + policy `audit_log_self_insert`. 009 = enum `review_source_enum` (`business_profile`/`places_api`/`manual`) + columna `source` en `reviews`. 010 = columna `removed_at` + índice parcial + view `reviews_active`. **011 = añade valor `'office_director'` al enum `role_enum`** (aislado por la limitación 55P04 de Postgres: un nuevo valor de enum no puede usarse como literal en la misma transacción en que se añadió). **012 = resto del rol `office_director`**: constraint `role_requires_location`, helper `current_office_location()` y policies RLS para director sobre `locations`, `profiles` `role='sales'`, `reviews`, `clients`, `share_links`. **013 = el office_director pasa de scope por location a scope por equipo** (`profiles.director_id`): nueva columna auto-referencial + reescritura de policies de profiles/reviews/clients/share_links a `director_id = auth.uid()`. La policy de `locations` se mantiene por `location_id` (acceso a su ficha sigue por oficina). Permite varios directores en la misma ficha, cada uno con su equipo (p.ej. uno por idioma en Internacional).
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
- **7 fichas**: 5 Inseryal (Oropesa, Pardiñas, Príncipe de Vergara, Leganés, Chamberí) + 2 Marina d'Or Construcciones (Castellón, Valencia). **Todas tienen `google_place_id`** y están sincronizando vía Places API. `oauth_status: disconnected` para Business Profile (esperando cuota Google) — el dashboard y `/fichas` lo reflejan como "Places API" (verde) en la columna Sincronización (ver §4.21).
- **Reseñas reales en BD**: 72 con `source='places_api'` desde 2026-05-23, todas en estado `unmatched` (no había share_links coincidentes con sus fechas históricas porque los comerciales aún no han activado su acceso). Visibles en `/resenas/verificacion?state=unmatched`. Cuando se activen y empiecen a generar share_links, las reseñas que entren en la ventana 48h se atribuirán automáticamente.

Antes de actuar sobre datos verificar con `curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/<tabla>?select=... -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`. La BD evoluciona.

---

## 8. Backlog v2

> V1 cerrada (ver §3). Lo siguiente. Features concretas de v2 se irán definiendo conforme el negocio las pida; por ahora aquí quedan los pendientes técnicos y las open questions de spec.md que no se cerraron en v1.

1. **Esperar aprobación Google Business Profile** (caso `5-5855000041022`, ETA ~2026-06-04). Mientras tanto el cron de Places API (§4.b) ya está trayendo reseñas reales diariamente a las 5:00 UTC.
2. **Cuando Google apruebe Business Profile**:
   - Probar OAuth E2E (`listAccounts` / `listLocations` / `listReviews`).
   - Conectar las 7 fichas desde `/fichas` en prod (el redirect URI de prod ya está añadido en Google Cloud Console).
   - Tras el primer run exitoso del cron Business Profile, ejecutar **script de dedup one-shot** (§4.17) para limpiar los clones `places_api` ↔ `business_profile` de la misma reseña. Script SQL aproximado (validar antes de correr):
     ```sql
     -- borra clones places_api cuando hay una versión business_profile equivalente
     delete from reviews places
     using reviews biz
     where places.source = 'places_api'
       and biz.source = 'business_profile'
       and places.location_id = biz.location_id
       and places.author_name = biz.author_name
       and places.rating = biz.rating
       and abs(extract(epoch from (places.google_created_at - biz.google_created_at))) < 3600;
     ```
3. **Publicar consent screen fuera de Testing** (Verification de Google) si en el futuro hay testers externos al equipo interno actual.
4. **Polish técnico restante**:
   - Seed más realista para dev (los E2E specs usan datos de prueba reales contra Supabase; cuando crezca el cubrimiento, considerar un proyecto Supabase de pruebas).
   - Ampliar E2E: sales-flow (crear cliente, compartir enlace) cuando haya un comercial fijo de pruebas en BD; cron con fixture del Google API.
   - Refactor de modal backdrops a componente Dialog compartido con focus trap + Escape handler (hoy lint warnings, no errors).
5. **Ajustes globales** (`/ajustes`): la ruta existe pero está **oculta del sidebar admin** hasta tener contenido (era un stub `ComingSoon` que confundía). Cuando se implemente alguna de las funcionalidades planeadas (reglas de matching configurables, plantilla del email de invitación, schedule del cron, plantilla del mensaje de WhatsApp), añadir de vuelta el item `{ id: "settings", label: "Ajustes", href: "/ajustes", icon: Settings }` en `ADMIN_SIDEBAR_GROUPS` de [`components/layout/Sidebar.tsx`](components/layout/Sidebar.tsx) (junto a "Fichas Google"). Sigue siendo solo-admin por middleware.
6. **Open questions abiertas en `spec.md` §9** (decisiones de producto pendientes):
   - #1 Dominio definitivo (`reseñahub.es` vs `resenas.inseryal.es`).
   - #2 Branding final (logo, paleta exacta, tipografía).
   - #3 Integración CRM externo para alta de clientes (hoy manual).
   - #6 Política de retención (¿borrar share_links >90 días? ¿reseñas archivadas?).
   - #7 Alertas tiempo real al admin sobre reseñas ≤3★.
   - #8 Encriptar `oauth_refresh_token` en reposo (Supabase Vault / pgcrypto).

---

## 9. Mantenimiento

Cada vez que termine una tanda significativa:
1. Actualizar §3 con lo nuevo (no añadir prosa: usar bullets cortos).
2. Si surge un workaround nuevo, entrada en §4.
3. Si la BD cambia (usuarios, fichas, migraciones), actualizar §7.
4. Si se cierran open questions de la spec, marcarlas en `spec.md`.
5. Commit + push.

Los `MEMORY.md` de `~/.claude/projects/...` son **locales a cada Mac**, no se versionan. La continuidad cross-Mac es este `CLAUDE.md` + `spec.md`.
