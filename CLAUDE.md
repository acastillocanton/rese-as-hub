# CLAUDE.md

Este archivo lo lee Claude Code automáticamente al abrir el repo. Vive en git → viaja entre Macs → todas las sesiones arrancan con el mismo contexto.

> **Fuente de verdad del producto**: [`spec.md`](spec.md). Si entra en conflicto algo de este archivo con la spec, gana la spec.

---

## 1. Resumen ultra-rápido

**ReseñaHub** — app interna single-tenant para **Inseryal by Marina d'Or**. Sustituye el "parte semanal de reseñas" que Raquel Piquer compila a mano en Excel. Tres roles:

- **admin**: gestor global. Hoy son 2 personas: Alejandro Castillo (`alejandro.castillo@inseryal.es`) y Rafael Ibáñez (`rafael.ibanez@inseryal.es`). Acceso total a todo.
- **sales** (comercial): genera enlaces personalizados por cliente, ve sus reseñas y ranking.
- **reviews_manager** (Raquel Piquer): comparte vista con admin en Dashboard + comerciales + ficha del comercial, **con permisos plenos de administración sobre el rol sales** (invitar, editar, reenviar acceso, eliminar — ver migración 005 y `assertCanManageSales` en `actions.ts`). Adicional: lista global de reseñas + descarga Excel (`/manager/*`). NO accede a: `/gestores`, `/fichas`, `/resenas/verificacion`, `/ajustes` (esos siguen siendo solo-admin).

Flujo: comercial comparte `reseñahub.es/c/{slug-comercial}/{slug-cliente}` → cliente cae directo en "Escribir reseña" en Google (302) → cron sincroniza vía Google Business Profile API → algoritmo atribuye la reseña al comercial mediante ventana temporal + nombre del cliente.

Stack: Next.js 15.5.18 App Router + Turbopack · TypeScript strict · Supabase (Postgres + Auth + RLS) · Google Business Profile API + OAuth (una credencial por ficha) · Brevo SMTP — vía Supabase para magic-links + invites + vía Nodemailer ([lib/email/brevo.ts](lib/email/brevo.ts)) para notificaciones transaccionales al comercial (mismo proveedor, claves SMTP independientes) · Vercel hosting (proyecto `rese-as-hub` en equipo "Marina d'Or Construcciones" Hobby) + Cron diario en `0 9 * * *` UTC · ExcelJS · qrcode.react · Zod · lucide-react (iconos).

**Producción**: [`https://resenas.marinadorconstrucciones.com`](https://resenas.marinadorconstrucciones.com). DNS gestionado en SiteGround.

---

## 2. Comandos esenciales

```bash
npm install            # primera vez en una máquina nueva
npm run dev            # Next dev con Turbopack en http://localhost:3000
npm run build          # build producción (verifica tipos)
npm run typecheck      # tsc --noEmit — pasar antes de dar tarea por completada
npm run lint           # next lint
```

**Operaciones con la base de datos** (cuando hay que migrar): ejecutar SQL en Supabase Dashboard → SQL Editor en orden numérico (`001_*`, `002_*`, …). Las migraciones son `Ask first` (ver §6).

---

## 3. Estado del proyecto (snapshot 2026-05-22)

> **Producción**: `https://resenas.marinadorconstrucciones.com` (Vercel, equipo "Marina d'Or Construcciones" Hobby). Login en prod funciona end-to-end (validado E2E el 2026-05-22).

### Fase 1 · Foundation — ✅ hecha
- Schema (locations + location_secrets + profiles + clients + share_links + reviews + audit_log) + RLS + helper `current_role()`.
- Middleware con auth + roles + redirección por rol.
- Magic-link login + callback.
- Landing pública `/c/[salesSlug]/[clientSlug]` registra share_link + 302 a Google.
- Modo demo sin `.env`.

### Fase 2 · Admin — ✅ hecha
| Pantalla | Estado |
|---|---|
| [`/dashboard`](app/(admin)/dashboard/page.tsx) | ✅ DB real + **RangePicker funcional en el topbar** (Mes actual / Mes pasado / Último trimestre + rango libre). KPIs + leaderboard + breakdown por ficha se recalculan según rango. Histórico de 6 meses se queda fijo. `DemoFallback` solo si falta `.env`. |
| [`/comerciales`](app/(admin)/comerciales/page.tsx) | ✅ DB real + invite + reenviar acceso + delete + fila navegable. `canEdit` = admin **o** reviews_manager (manager ahora con plenos permisos, ver Fase 5). |
| [`/comerciales/[slug]`](app/(admin)/comerciales/[slug]/page.tsx) | ✅ **Mini-dashboard del comercial** con RangePicker + botón "Descargar Excel" individual. KPIs por rango (visitas / atribuidas / conversión / valoración media). `SalesEditCard` editable tanto para admin como para reviews_manager. |
| [`/gestores`](app/(admin)/gestores/page.tsx) | ✅ Página propia (separada de comerciales). Lista + invite + reenviar + delete. Modelo: un gestor (Raquel) pero soporta varios. |
| [`/resenas/verificacion`](app/(admin)/resenas/verificacion/page.tsx) | ✅ bandeja de reseñas `pending`/`unmatched`. Acciones confirmar / rechazar / reasignar. Auditoría en `audit_log` por cada acción (vía `recordAudit()` con service-client — ver §4.6). |
| [`/fichas`](app/(admin)/fichas/page.tsx) | ✅ lista + add + delete + Conectar/Desconectar Google + UI selección de Business Profile en `/fichas/[id]/conectar`. |

### Fase 3 · Sales (comercial) — ✅ hecha (validada E2E el 2026-05-21, ampliada 2026-05-22)
- [`/panel`](app/(sales)/panel/page.tsx) con datos reales del comercial logueado (KPIs propios, proyección ETA, enlace personal) + **RangePicker funcional en el topbar** (Mes actual / Mes pasado / Último trimestre + rango libre). La pill "vs. mes pasado" solo aparece para meses naturales completos y la proyección ETA solo se calcula si el rango incluye HOY. Ranking aparcado como `ComingSoon` (requiere migración nueva).
- [`/panel/enlace`](app/(sales)/panel/enlace/page.tsx) — "Sala de armas del comercial": URL del comercial + botón Copiar, QR 200px ([qrcode.react](https://www.npmjs.com/package/qrcode.react)) con "Descargar PNG", plantilla genérica editable (sin `{nombre_cliente}`, pensada para QR de mostrador), deep-links WhatsApp/Email/SMS sin destinatario, 3 KPIs (visitas QR genérico mes / totales / visitas por cliente este mes) + bloque "Cómo sacarle partido".
- [`/panel/resenas`](app/(sales)/panel/resenas/page.tsx) — Histórico personal del comercial con RangePicker + 4 KPIs (atribuidas / valoración media / excelentes 5★ / rango activo) + lista cronológica con autor, estrellas, fecha, texto, cliente asociado, ficha y Pill de match_state. Empty state con CTAs a `/panel/enlace` y `/clientes`.
- [`/clientes`](app/(sales)/clientes/page.tsx) entero: lista, alta con server action, dialog con URL + QR + plantilla editable + deep-links WhatsApp/Email/SMS. Fila navegable a detalle.
- [`/clientes/[slug]`](app/(sales)/clientes/[slug]/page.tsx) detalle del cliente: datos editables inline vía [`ClientEditCard`](app/(sales)/clientes/[slug]/ClientEditCard.tsx), KPIs de visitas, bloque compartir reusado, placeholder reseñas (lista real cuando entre Fase 4), botón eliminar.
- [`lib/messaging.ts`](lib/messaging.ts) con plantilla por defecto + helpers de deep-link.

> Sidebar antes apuntaba a anchors `/panel#enlace` y `/panel#resenas` que no existían (los links solo recargaban `/panel` sin scroll a nada). Ya migrado a las rutas dedicadas en [`components/layout/Sidebar.tsx`](components/layout/Sidebar.tsx).

#### Fase 3.b · Vista mobile del comercial — ✅ hecha (2026-05-22)
**Solo el rol sales** tiene vista mobile (≤767px). Admin/gestor/profile siguen siendo desktop-only por diseño (trabajo de oficina). En vez de duplicar páginas, usamos **CSS media queries puras** con clases con prefijo `sales-*` definidas al final de [`app/globals.css`](app/globals.css) — sin hooks JS, sin route group nuevo, sin flicker SSR/CSR.

Estructura:
- Sidebar de 232px se oculta vía `.sales-hide-mobile { display: none !important }` en mobile.
- Aparece [`<MobileTabBar />`](components/layout/MobileTabBar.tsx) fija inferior con 4 tabs: Panel · Enlace · Reseñas · Ranking (lucide icons). `padding-bottom: env(safe-area-inset-bottom)` para iPhones con notch. Reusa el helper [`pickActiveId`](components/layout/active-item.ts) compartido con `Sidebar`.
- [`<main className="sales-main">`](app/(sales)/layout.tsx) reserva `padding-bottom: 64px` para que la tab bar no tape contenido al final del scroll.
- "Clientes" intencionalmente NO está en la tab bar (fidelidad al mockup). Se accede desde una **card "Mis clientes" mobile-only** en `/panel` o por URL directa.
- [`/panel/ranking`](app/(sales)/panel/ranking/page.tsx) es un placeholder ComingSoon hasta que se implemente el ranking real (requiere migración 007).

Patrón de clases mobile (todas con `!important` para vencer al inline `style={{}}` desktop):
- `sales-hide-mobile` / `sales-hide-desktop` / `sales-mobile-only` — visibilidad selectiva.
- `sales-page-pad` — reduce padding 24/32 → 16.
- `sales-grid-hero`, `sales-stats-3`, `sales-stats-4`, `sales-qr-grid`, `sales-detail-grid` — grids fijos → 1 col (o 2x2 en stats-4).
- `sales-ring-row` — flex row → column (Ring + texto objetivo).
- `sales-review-row` + `sales-review-pill` — review item se reorganiza con pill debajo del texto.
- `sales-rangepicker-popover` — `width: calc(100vw - 24px); max-width: 320px` para que no desborde en iPhone SE.
- `sales-topbar-compact` + `sales-topbar-title` + `sales-topbar-breadcrumb` — Topbar más compacto, breadcrumb oculto en mobile. Activada via prop opcional `compact?: boolean` en [`Topbar.tsx`](components/layout/Topbar.tsx); solo páginas sales la pasan, admin/manager no.

`ClientRowItem` mantiene dos sub-layouts coexistentes en el mismo componente (uno con `sales-hide-mobile` para grid 5 cols, otro con `sales-mobile-only` para card vertical con labels inline) compartiendo el mismo estado de open/isPending.

### Fase 4 · Google sync + matching — ⚠️ código listo, esperando aprobación de Google
**Es el corazón del producto.** Código entero implementado y OAuth validado E2E. Único bloqueo: la cuota de la API está a 0 hasta que Google apruebe la solicitud (caso `5-5855000041022`, ETA ~2026-06-04).

Hecho:
1. [`lib/google/business-profile.ts`](lib/google/business-profile.ts) — cliente API con refresh-token automático + **`fetchWithRetry()` con backoff exponencial + Retry-After** para 429/5xx. Cubre OAuth, Account Management, Business Information y Reviews (v4 legacy).
2. [`/api/google/oauth/start`](app/api/google/oauth/start/route.ts) — inicia consent con state CSRF en cookie httpOnly+Secure+SameSite=lax.
3. [`/api/google/oauth/callback`](app/api/google/oauth/callback/route.ts) — token swap, persiste en `location_secrets`, redirige a `/fichas/[id]/conectar`.
4. [`/fichas/[id]/conectar`](app/(admin)/fichas/[id]/conectar/page.tsx) — UI que lista las cuentas + fichas de Google. Pre-selecciona la que coincide por `google_place_id`.
5. [`lib/matching/attribute-review.ts`](lib/matching/attribute-review.ts) — algoritmo con ventana temporal (`TEMPORAL_WINDOW_HOURS=48`) + similitud Unicode-aware. Thresholds: `AUTO_THRESHOLD=75` → counted, 40-75 → pending, <40 → unmatched.
6. [`/api/cron/sync-google-reviews`](app/api/cron/sync-google-reviews/route.ts) — **paginación con nextPageToken** (MAX_PAGES=10) + early-exit cuando la página ya está sincronizada. Idempotente vía `unique (location_id, google_review_id)`. Si Resend falla al notificar, registra `notify_failed` en `audit_log` con el review_id para reconciliar.
7. [`vercel.json`](vercel.json) — schedule `0 9 * * *` (diario 09:00 UTC, cambiado de `*/10 * * * *` por límite de Vercel Hobby, ver §4.11). Protegido por `CRON_SECRET` con `timingSafeEqual`.
8. [`lib/email/notify-new-review.ts`](lib/email/notify-new-review.ts) + [`lib/email/resend.ts`](lib/email/resend.ts) — email al comercial activo cuando entra reseña `counted`. **Todas las cadenas externas se escapan con `escapeHtml`** (authorName, clientFullName, locationName, preheader, firstName). Degrada gracefully si `RESEND_API_KEY` no está set.

Pendiente:
- ✅ Migración 004 aplicada en Supabase (2026-05-21).
- ✅ Google Cloud configurado: proyecto `628454280082`, OAuth Web App, consent screen en Testing.
- ✅ `.env.local` con `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
- ✅ OAuth flow validado E2E (token swap + userinfo).
- ⏳ **Quota a 0 hasta que Google apruebe acceso a la API**. Solicitud enviada 2026-05-21, **case ID `5-5855000041022`**. ETA ~2026-06-04. Sin esto las APIs `mybusiness*` devuelven 429 RESOURCE_EXHAUSTED.

### Fase 5 · Reviews manager (Raquel) — ✅ hecha (esperando reseñas reales)
**Decisión de diseño 2026-05-21 + ampliación 2026-05-22**: el gestor unifica con admin en lugar de tener un universo paralelo `/manager/*`. Comparte `/dashboard` y `/comerciales/*` con el admin, **ahora con plenos permisos de administración sobre el rol sales** (invitar, editar, reenviar acceso, eliminar — antes era solo lectura). Las pantallas viejas `/manager/comerciales` y `/manager/comerciales/[slug]` fueron eliminadas.

> Gating: helper [`assertCanManageSales()`](app/(admin)/comerciales/actions.ts) (admin o reviews_manager) aplicado a `inviteSales`, `updateSales`, `resendSalesAccess`, `deleteSales`. RLS: migración [`005_manager_sales_admin.sql`](supabase/migrations/005_manager_sales_admin.sql) añade políticas INSERT/UPDATE/DELETE para que `reviews_manager` opere sobre filas `profiles` con `role='sales'`. El `with check` impide escalar un sales a admin/manager. `/gestores`, `/fichas`, `/resenas/verificacion` y `/ajustes` siguen siendo solo-admin.

Sidebar gestor (en [`components/layout/Sidebar.tsx`](components/layout/Sidebar.tsx) → `MANAGER_SIDEBAR_GROUPS`):
- Dashboard → `/dashboard` (mismo que admin)
- Comerciales → `/comerciales` (mismo que admin sin acciones)
- Reseñas → `/manager/resenas`
- Exportar Excel → `/manager/export`

Pantallas propias del manager:
- [`/manager/resenas`](app/(manager)/manager/resenas/page.tsx) — lista global con RangePicker en topbar + filtros (comercial, ficha, match_state).
- [`/manager/export`](app/(manager)/manager/export/page.tsx) — 3 atajos rápidos (Mes actual / Mes pasado / Último trimestre) + formulario personalizado.
- [`/api/export/reviews`](app/api/export/reviews/route.ts) — acepta `from`/`to` (yyyy-mm-dd) + filtros opcionales. Devuelve .xlsx con **Hoja 1 Reseñas** (detalle auditable) + **Hoja 2 Resumen dashboard**: cabecera marca, KPIs grandes (reseñas, visitas, conversión global, valoración media, sin atribuir), tabla Comerciales con visitas → reseñas → conversión → objetivo → cumplimiento (verde/ámbar/rojo según ≥100%/≥60%/<60%), tabla Fichas con valoración media. Filename `resenas-{from}_{to}.xlsx`.

El admin tiene en su sidebar los items `Reseñas` y `Exportar Excel` que apuntan a las mismas URLs `/manager/*` (el `(manager)/layout.tsx` detecta el rol del visor y pinta el sidebar adecuado).

### Perfil global (`/perfil`) — ✅ hecho (2026-05-22)
Ruta accesible a los tres roles bajo route group [`app/(profile)/`](app/(profile)/) con layout propio que detecta el rol del visor y pinta el sidebar adecuado (admin / sales / manager).

- [`/perfil`](app/(profile)/perfil/page.tsx) muestra foto + datos de cuenta (nombre, email, rol, estado, slug, miembro desde).
- [`PhotoUpload.tsx`](app/(profile)/perfil/PhotoUpload.tsx) sube a Storage con upsert (`{user_id}/avatar.ext`), persiste `profiles.avatar_url` y refresca server components con `router.refresh()`. Cache-busting con `?v={timestamp}`. Validación: PNG/JPG/WebP, máximo 4 MB.
- Sidebar: la sección user-info es un `<Link>` único a `/perfil` (sin botón al lado, para evitar misclicks que cerraban sesión sin querer). El "Cerrar sesión" vive dentro de `/perfil` → Card "Sesión" → form POST a `/auth/signout`. El componente [`Avatar`](components/ui/Avatar.tsx) acepta prop `src` opcional: si la hay pinta `<img>` redondo, si no fallback al círculo con iniciales.
- Middleware: `/perfil` en allowlist de los tres roles ([`lib/supabase/middleware.ts`](lib/supabase/middleware.ts)).
- Migración [`006_profile_avatars.sql`](supabase/migrations/006_profile_avatars.sql): columna `profiles.avatar_url` + bucket público `avatars` en Storage + 3 policies (cada usuario solo puede escribir en su carpeta `{user_id}/`, SELECT público para que la PublicUrl se pinte sin auth).

### Páginas legales — ✅ hechas
- [`/privacidad`](app/(legal)/privacidad/page.tsx) y [`/terminos`](app/(legal)/terminos/page.tsx) bajo route group [`app/(legal)/`](app/(legal)/) con layout propio (sin sidebar, accesible sin auth). Linkadas desde el pie de [`app/login/page.tsx`](app/login/page.tsx).

### Fase 7 · Deploy producción — ✅ hecha (2026-05-22)
- **Dominio**: `https://resenas.marinadorconstrucciones.com` con CNAME desde SiteGround DNS apuntando al target específico del proyecto Vercel (`a15b66f05763b0b1.vercel-dns-017.com`). Antes de crear el CNAME hubo que **borrar el subdominio "resenas" en Site Tools de SiteGround**: el sistema había auto-creado A y TXT (SPF/DKIM) defecto que entran en conflicto con CNAME por RFC.
- **Hosting**: Vercel, equipo "Marina d'Or Construcciones" (Hobby). Cuenta GitHub que importó el repo es la **misma** que es dueña del equipo Vercel — sin esa coincidencia, Hobby plan bloquea el deploy por "GitHub could not associate the committer with a GitHub user" (no permite colaboradores).
- **Cron**: `vercel.json` ajustado a `0 9 * * *` (diario 09:00 UTC). Vercel Hobby **no permite cron sub-diario** (rechaza `*/10 * * * *` con "would run more than once per day"). Trade-off: reseñas aparecen con delay máx 24h en lugar de 10 min. Disparo manual desde Vercel Cron Jobs UI cuando se necesite inmediatez.
- **Env vars en Vercel**: las 11 esenciales (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL=https://resenas.marinadorconstrucciones.com`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI=https://resenas.marinadorconstrucciones.com/api/google/oauth/callback`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, `BREVO_FROM_EMAIL`). Migración Resend → Brevo completada 2026-05-22, ver §4.12.
- **Supabase**: `Site URL` cambiado de `http://localhost:3000` a `https://resenas.marinadorconstrucciones.com`. `Redirect URLs` incluyen ambos (`http://localhost:3000/**` + `https://resenas.marinadorconstrucciones.com/**`). Plantilla Magic Link: `type=email` (no `magiclink`, deprecated — ver §4.9).
- **Google Cloud**: añadido `https://resenas.marinadorconstrucciones.com/api/google/oauth/callback` a Authorized redirect URIs del OAuth client. Localhost se queda para dev.
- **Login E2E validado** desde incógnito el 2026-05-22.

### Fase 6 · Polish — ⚠️ parcial
Hecho (auditoría técnica del 2026-05-21):
- `error.tsx` por grupo (`(admin)`, `(sales)`, `(manager)`) + `global-error.tsx` raíz con componente reusable [`ErrorState`](components/layout/ErrorState.tsx).
- Cron Google: paginación + early-exit + retry/backoff cliente + audit_log de fallos de email.
- Email transaccional: escape HTML completo.
- `audit_log` operativo (antes los inserts vía cookie-context fallaban silenciosamente; ahora pasan por [`recordAudit()`](lib/audit.ts) con service-client).
- Indexación bloqueada: [`robots.txt`](app/robots.ts) Disallow:/ + `metadata.robots` noindex/nofollow en layout raíz.
- Bump Next.js 15.1.0 → 15.5.18 (cubrió 14 advisories incluida 1 critical de Authorization Bypass en Middleware).
- Sidebar agrupado por dominio + iconos lucide-react (ver §3 cualquier pantalla).
- RangePicker funcional reusable ([`components/ui/RangePicker.tsx`](components/ui/RangePicker.tsx)) reemplazando al `<DateRange>` decorativo. Aplicado a `/dashboard`, `/comerciales/[slug]`, `/manager/resenas`, `/panel` y `/panel/resenas`.
- Botón "Reenviar acceso" en comerciales y gestores ([`components/ui/ResendAccessButton.tsx`](components/ui/ResendAccessButton.tsx)) — genera magic-link fresco vía service-client sin tener que eliminar y volver a invitar.

Pendiente:
- ⏳ **Aplicar migraciones 005 y 006 en Supabase Dashboard** (SQL Editor). 005 = políticas RLS para que gestor administre sales. 006 = avatar_url + bucket Storage. Hasta aplicarlas: las acciones admin del gestor sobre comerciales fallan por RLS, y el upload de foto de perfil da 404 al bucket.
- A11y, loading states, seed realista, tests Vitest + Playwright.
- `noUncheckedIndexedAccess` en tsconfig (baja prioridad).
- Política INSERT en `audit_log` (hoy parcheado vía service-client en [`recordAudit()`](lib/audit.ts) — ver §4.6).

---

## 4. Workarounds operativos vigentes

Cosas reales del estado actual que hay que saber para no tropezar:

### 4.1 Auth por email — flujo OTP `token_hash` (no PKCE)
Brevo SMTP está configurado en Supabase Auth. Los tres caminos auth (login, invite, reenviar) terminan en el mismo handler [`/auth/confirm`](app/auth/confirm/route.ts) que hace `verifyOtp({ token_hash, type })` server-side. PKCE rompía cuando el destinatario abría el link desde otro dispositivo + email scanners pre-fetchaban el token (ver §4.9).

Cómo funciona ahora (validado E2E el 2026-05-22):
1. **Invite admin** (crear comercial/gestor): `createInvitedProfile()` en [`lib/invite.ts`](lib/invite.ts) llama `auth.admin.generateLink({ type: "invite" })`, construye URL `/auth/confirm?token_hash=...&type=invite&next=...` y devuelve el link al admin para que lo comparta.
2. **Reenviar acceso**: `generateAccessLink()` en [`lib/auth/resend-link.ts`](lib/auth/resend-link.ts) hace lo mismo con `type=magiclink`. Server actions: `resendSalesAccess()` y `resendManagerAccess()`.
3. **Login normal del usuario**: [`app/login/LoginForm.tsx`](app/login/LoginForm.tsx) usa **cliente vanilla `@supabase/supabase-js`** (NO `@supabase/ssr`, ver §4.10) con `flowType: 'implicit'` y `signInWithOtp` sin `emailRedirectTo`. Supabase emite token OTP normal (sin prefijo `pkce_`), envía email vía Brevo, el botón apunta a `/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=%2F`.
4. [`app/auth/confirm/route.ts`](app/auth/confirm/route.ts) hace `verifyOtp({ token_hash, type })` server-side y redirige a `next` (validado con `isSafeNext`). Tiene además un `HEAD` handler vacío para que email scanners no consuman el token (§4.9).

Plantillas en Supabase Dashboard (Authentication → Email Templates) — editar a mano:
- **Magic Link**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=%2F` ⚠️ `type=email`, NO `magiclink` (este último está deprecated en Supabase Auth y devuelve `otp_expired` aunque el token sea válido).
- **Invite user**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=%2Fpanel` (sigue siendo `invite`, no está deprecated).
- Verificar `Site URL` (debe ser la URL de prod: `https://resenas.marinadorconstrucciones.com`) y `Redirect URLs` (incluye `http://localhost:3000/**` + URL de prod con `/**`) en Authentication → URL Configuration.

### 4.2 Rate limit Supabase Auth — ya mitigado vía Brevo
Workaround manual disponible: [`/login/manual?token=<hashed_token>`](app/login/manual/page.tsx) — redirige a `/auth/confirm`. Para generar token desde terminal:
```bash
set -a && source .env.local && set +a && \
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"<email@inseryal.es>"}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("http://localhost:3000/login/manual?token="+d.get("hashed_token",""))'
```

### 4.3 Status auto-flip `invited` → `active` al primer login
[`app/auth/confirm/route.ts`](app/auth/confirm/route.ts) hace un `UPDATE profiles SET status='active' WHERE id=user.id AND status='invited'` tras un `verifyOtp` exitoso. `paused` se respeta. El admin puede forzar el estado desde la ficha del comercial.

### 4.4 Hydration warning silenciado en `<html>`
[`app/layout.tsx`](app/layout.tsx) usa `suppressHydrationWarning` porque alguna extensión del navegador inyecta `className="light"` antes de que React hidrate.

### 4.5 Workspace root en `next.config.ts`
**Crítico para macOS**: hay un `package-lock.json` huérfano en `/Users/usuario/` que confunde a Next 15.5+. Si no se fija el workspace root explícitamente:
- Turbopack intenta leer `~/Documents` y macOS responde permiso denegado TCC → dev server muere.
- Build webpack falla con "Cannot find module for page: /_document".

[`next.config.ts`](next.config.ts) tiene `turbopack: { root: __dirname }` + `outputFileTracingRoot: __dirname`. NO QUITAR.

### 4.6 `audit_log` siempre via service-client
La tabla `audit_log` tiene RLS habilitada pero **sin política de INSERT** ([002_rls_policies.sql:94-98](supabase/migrations/002_rls_policies.sql)). Cualquier insert desde contexto-cookie falla silenciosamente (RLS lo niega y Supabase devuelve sin error visible en muchos casos). Por diseño: el usuario no debe poder fabricar entradas de auditoría.

Usar siempre el helper [`recordAudit()`](lib/audit.ts) en código server-only. Bypasea RLS via service-client. Errores de insert se logean pero no rompen la acción de negocio.

### 4.7 Eliminar y recrear perfiles — usar service-client
`generateLink({ type: "invite", email })` rechaza con `email_exists` si ya existe un `auth.user` con ese email, aunque el `profile` se haya borrado. Las acciones `deleteSales` y `deleteReviewsManager` borran tanto el `profile` como el `auth.user` via service-client para liberar el slot. Si aun así quieres recuperar un acceso, usar **"Reenviar acceso"** (genera magic-link fresco para email existente) en lugar de eliminar + reinvitar.

### 4.8 Si dev server peta con `.next/server/...not found`
Caché de Turbopack corrupta tras un `npm install` parcial o un proceso huérfano. Reset:
```bash
pkill -f "next" 2>/dev/null; sleep 2
rm -rf .next node_modules
npm install
npm run dev
```

### 4.9 HEAD handler vacío en `/auth/confirm` — email scanners consumen el OTP
Los email scanners (Microsoft Safe Links, antivirus corporativos, link previewers de Brevo/Gmail/Outlook) hacen `HEAD` a las URLs del email al recibirlo. Next.js sin handler `HEAD` explícito **ejecuta el `GET` completo** para responder los headers — incluyendo `verifyOtp`, que consume el token. Cuando el usuario pulsa el link 30+ seg después, el token ya está usado → `otp_expired`.

Fix: [`app/auth/confirm/route.ts`](app/auth/confirm/route.ts) exporta un `HEAD` que devuelve `200 OK` sin tocar Supabase. Los scanners se dan por satisfechos sin gastar el token. NO QUITAR.

Síntoma en logs si reaparece: 2 `HEAD 307 /auth/confirm` seguidas inmediatamente después del envío del email, y el `GET` posterior con error `otp_expired`.

### 4.10 LoginForm usa cliente vanilla `@supabase/supabase-js` (no `@supabase/ssr`)
`@supabase/ssr` fuerza flujo PKCE en `createBrowserClient` ignorando `flowType: 'implicit'`. Eso hace que `signInWithOtp` emita tokens con prefijo `pkce_` en el email, que el handler `/auth/confirm` (con `verifyOtp`) rechaza con `otp_expired`.

Por eso [`app/login/LoginForm.tsx`](app/login/LoginForm.tsx) importa `createClient` directamente desde `@supabase/supabase-js` (sin SSR) con `flowType: 'implicit'`, `persistSession: false`, `autoRefreshToken: false` SOLO para esta llamada. La sesión la materializa server-side `/auth/confirm` al hacer `verifyOtp`, así que el cliente del login no necesita persistir nada.

El resto de la app sigue usando `@supabase/ssr` ([`lib/supabase/client.ts`](lib/supabase/client.ts), [`lib/supabase/server.ts`](lib/supabase/server.ts)) como siempre. La excepción es solo el LoginForm.

### 4.11 Vercel Hobby — cron diario máximo
El plan Hobby de Vercel **solo permite cron jobs diarios** (1 ejecución/día). El schedule `*/10 * * * *` que ideal hubiéramos preferido rechaza el deploy con "would run more than once per day". [`vercel.json`](vercel.json) tiene `0 9 * * *` (diario 09:00 UTC ≈ 11:00 hora peninsular en verano), con ventana flexible de 1 hora que avisa Vercel.

Si en algún momento se necesita inmediatez:
- **Botón "Run" manual** en Vercel Cron Jobs UI (dispara el endpoint con el token correcto).
- **Cron externo gratuito** (cron-job.org o GitHub Actions) que llama al endpoint `/api/cron/sync-google-reviews` con `Authorization: Bearer <CRON_SECRET>`. Vercel no impone límites a invocaciones externas, solo a sus propios crons internos.
- **Upgrade a Vercel Pro** (~$20/usuario/mes) si se prefiere mantener todo en Vercel y poder volver a `*/10`.

### 4.12 Brevo SMTP — IP whitelist hay que dejarlo desactivado
Brevo tiene una opción **"Bloqueo de direcciones IP no autorizadas"** en Settings → Seguridad → IP autorizadas con toggles para "Claves API" y "Claves SMTP". Si están activados (por defecto en cuentas nuevas a veces lo están), los envíos SMTP fallan con `525 5.7.1 Unauthorized IP address` desde cualquier IP que no esté en la whitelist.

**Hay que dejar el toggle "Claves SMTP" en Desactivado** porque:
- Vercel corre en IPs dinámicas dentro de rangos amplios de AWS. No publican una lista estable que podamos whitelistear de antemano. Si activáis bloqueo, el cron en prod fallaría aleatoriamente cuando Vercel cambie de IP.
- La autenticación con `BREVO_SMTP_PASS` (la SMTP key) ya garantiza que solo quien tenga la clave puede mandar. Restringir además por IP no añade seguridad práctica en este setup.

Si en algún momento Brevo lo reactiva solo (lo hicieron una vez con cuentas nuevas en 2024), se ve clavado con un 525 y se desactiva volviendo a Settings → Seguridad → IP autorizadas → toggle "Claves SMTP" → off.

### 4.14 Clases `sales-*` solo dentro del scope sales
Las clases con prefijo `sales-*` definidas al final de [`app/globals.css`](app/globals.css) usan `!important` para vencer a los inline `style={{}}` que tienen casi todos los componentes. Eso permite mobile sin tocar el desktop, pero también significa que aplicarlas fuera de `app/(sales)/` (o de [`components/layout/MobileTabBar.tsx`](components/layout/MobileTabBar.tsx)) contaminaría admin/manager/profile cuando alguien abriera esas rutas en mobile (cosa que no se debe hacer, esos roles son desktop).

Excepciones controladas (clases compartidas que viven en componentes UI compartidos pero que solo activan reglas con scope sales):
- [`Topbar.tsx`](components/layout/Topbar.tsx) acepta prop opcional `compact?: boolean` que pinta `sales-topbar-*`. Default `false`, solo páginas sales la pasan.
- [`RangePicker.tsx`](components/ui/RangePicker.tsx) lleva siempre `sales-rangepicker-popover` en su popover. En desktop la clase no hace nada; en mobile fija `width: calc(100vw - 24px)`. Inofensivo para admin/manager (que solo se ven desktop) y útil si alguien lo prueba en mobile.

### 4.13 Brevo — dos SMTP keys conviven sin pisarse
La cuenta Brevo tiene dos claves SMTP independientes que se usan en paralelo:
- **`resenahub-supabase`** (creada 2026-05-21) — la consume Supabase Auth para enviar magic-links y emails de invite. Configurada en Supabase Dashboard → Project Settings → Auth → SMTP Settings. NO TOCAR ni regenerar — rompería el login.
- **`resenahub-app`** (creada 2026-05-22) — la consume nuestro código en [lib/email/brevo.ts](lib/email/brevo.ts) para notificaciones transaccionales (email al comercial cuando entra una reseña atribuida). Va en `BREVO_SMTP_PASS` en `.env.local` y en Vercel.

Las dos comparten el mismo login (`BREVO_SMTP_USER=7e1a24001@smtp-brevo.com`) y el mismo remitente (`info@marinadorconstrucciones.com`, dominio autenticado en Brevo). Razón de mantenerlas separadas: si una se compromete o se rota, no afecta a la otra.

Brevo solo enseña el valor de cada SMTP key **una vez al crearla**. Si se pierde el valor de `resenahub-app`, la única solución es regenerarla (en Settings → SMTP & API → Claves SMTP → crear nueva → copiar el valor al instante → actualizar `.env.local` + Vercel + redeploy).

---

## 5. Setup en otro Mac

`.env.local` está en `.gitignore` — no viaja entre máquinas. En cada Mac:

1. `git clone https://github.com/acastillocanton/rese-as-hub.git`
2. `cd rese-as-hub && npm install`
3. Crear `.env.local` desde `.env.example`. Necesitas:
   - `NEXT_PUBLIC_SUPABASE_URL` → `https://zejwmznusszqlwhevaqv.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → publishable key (`sb_publishable_...`) desde Supabase Dashboard → Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` → secret key (`sb_secret_...`), misma pantalla.
   - `CRON_SECRET` → generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
   - Opcionales: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI` (para tocar la integración Google), `RESEND_API_KEY` (para mandar emails reales).
4. `npm run dev` → http://localhost:3000.
5. Para entrar: `/login` con `alejandro.castillo@inseryal.es`, recibes magic-link.

⚠️ **Las keys de Supabase usan el nuevo formato** `sb_publishable_*` / `sb_secret_*`.

---

## 6. Reglas críticas

### Always do
- Validar inputs externos en el límite del sistema (Zod en server actions, `isValidSlug`/`isSafeNext` en route handlers).
- Parametrizar consultas vía Supabase query builder.
- Aplicar RLS en toda tabla con datos sensibles. `location_secrets` tiene RLS sin políticas — solo service-role.
- Usar `createServiceClient` **solo** desde código server-only. **Nunca** importarlo desde un componente cliente.
- Usar `recordAudit()` ([`lib/audit.ts`](lib/audit.ts)) para escribir en `audit_log` — nunca insert directo desde contexto-cookie (ver §4.6).
- `npm run typecheck` antes de dar por completada una tarea.
- Actualizar la spec.md cuando una decisión cambie.

### Ask first
- **Migraciones de DB nuevas** (`supabase/migrations/00X_*.sql`).
- **Cambios al modelo de matching** (algoritmo, umbrales, ventana temporal).
- **Cambios al sidebar / IA de las pantallas**.

### Never do
- Commitear secretos. `.env*.local` está en `.gitignore`.
- Exponer service-role a un componente cliente.
- Devolver `oauth_refresh_token` ni `location_secrets` desde un endpoint accesible al usuario.
- Confiar en validación cliente como límite de seguridad.
- Redirect a URLs externas desde un parámetro de query sin pasar por `isSafeNext`.
- Tocar `_design_package/` (referencia de diseño, no código fuente).
- Quitar `turbopack.root` o `outputFileTracingRoot` de [`next.config.ts`](next.config.ts) (ver §4.5).
- Usar clases CSS con prefijo `sales-*` fuera de `app/(sales)/` o de [`components/layout/MobileTabBar.tsx`](components/layout/MobileTabBar.tsx) (ver §4.14).

---

## 7. Estado real de Supabase (snapshot 2026-05-22)

- **Proyecto**: `zejwmznusszqlwhevaqv.supabase.co`. Migraciones 001+002+003+004 aplicadas. **Migraciones 005 (manager-sales admin perms) y 006 (avatars + Storage bucket) pendientes de aplicar** — el código en main ya las asume.
- **URL Configuration** (Authentication → URL Configuration):
  - **Site URL**: `https://resenas.marinadorconstrucciones.com` (cambiado desde localhost el 2026-05-22).
  - **Redirect URLs**: `http://localhost:3000/**` + `https://resenas.marinadorconstrucciones.com/**`.
- **Email Templates** editadas a mano en Dashboard:
  - **Magic Link**: usa `type=email` (no `magiclink` que está deprecated).
  - **Invite user**: usa `type=invite`.
  - **Reset Password**: pendiente — no se usa el flow recovery hoy.
- **2 admins**: Alejandro Castillo + Rafael Ibáñez (ambos `@inseryal.es`).
- **1 comercial de prueba**: "Comercial prueba" / `comercial-prueba` / asignado a "Inseryal by Marina d'Or · Chamberí" / status `active`. Email: `a.castillo.esv@gmail.com`.
- **2 gestores activos**: Bel (`bel.bernete@inseryal.es`) — la gestora real del cliente — y "Gestor Ale" (`elalecu@gmail.com`) — cuenta de pruebas de Alejandro.
- **1 cliente de prueba**: "Otto Castillo" / `otto-castillo`.
- **7 fichas**: 5 "Inseryal by Marina d'Or" (Oropesa + Madrid Pardiñas + Madrid Príncipe de Vergara + Leganés + Chamberí) y 2 "Marina d'Or Construcciones" (Castellón + Valencia). Solo Chamberí tiene `google_place_id`. Todas `oauth_status: disconnected`.
- **2 share_links** registradas. 0 reseñas.

Antes de actuar sobre datos, verifica con `curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/<tabla>?select=... -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`. La BD evoluciona.

---

## 8. Próximo paso recomendado

Producto live en `https://resenas.marinadorconstrucciones.com` con login E2E funcionando + emails transaccionales por Brevo SMTP listos. Quedan:

1. **Aplicar migraciones 005 y 006** en Supabase Dashboard → SQL Editor en orden. Hasta que se apliquen: el gestor no puede crear/editar/borrar comerciales en prod (RLS lo niega) y el upload de foto de perfil falla (no existe `profiles.avatar_url` ni el bucket `avatars`).
2. **Esperar aprobación Google** (caso `5-5855000041022`, ETA ~2026-06-04). Sin esto las APIs `mybusiness*` devuelven 429 RESOURCE_EXHAUSTED y el cron no puede traer reseñas reales — el resto de la app sigue operativa.
3. **Cuando Google apruebe**: probar OAuth E2E con `listAccounts`/`listLocations`/`listReviews`. Si todo va bien, conectar las 7 fichas desde `/fichas` en prod. Recordar: el redirect URI de prod ya está añadido en Google Cloud Console (Authorized redirect URIs incluye `https://resenas.marinadorconstrucciones.com/api/google/oauth/callback`).
4. **Considerar publicar consent screen fuera de Testing en Google** (Verification de Google) cuando se valide OAuth en prod. Solo afecta si invitamos a usuarios externos al equipo de testers — para el equipo interno actual (admins + Raquel + comerciales fijos) Testing basta.
5. **Polish (Fase 6 restante, opcional)**: a11y, loading states, seed más realista, tests Vitest + Playwright, `noUncheckedIndexedAccess`, política INSERT en audit_log.

---

## 9. Cómo mantener este archivo

Cada vez que termine una tanda significativa de trabajo:
1. Actualizar §3 (estado por fase) con lo que se ha hecho.
2. Si surge un workaround nuevo, añadir entrada a §4.
3. Si la BD cambia (nuevos users, fichas, etc.), actualizar §7.
4. Si se cierran open questions de la spec, marcarlas en `spec.md` §9.
5. Commit con mensaje descriptivo + push.

Los `MEMORY.md` que veas dentro de `~/.claude/projects/...` son **locales a cada Mac** — no se versionan. Lo importante para la continuidad es este `CLAUDE.md` y la `spec.md`.
