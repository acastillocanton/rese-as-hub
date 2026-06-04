# ReseñaHub

Plataforma interna de Inseryal by Marina d'Or para gestionar reseñas de Google Business Profile por comercial.

> 🏁 **V1 cerrada el 2026-05-26 · v2 en curso (jun 2026)** — entregadas: anti-fraude, verificación abierta, alertas ≤2★, plantillas de mensaje, panel "Histórico/ranking/insignias", **periodo de comisión 20→20 + tarifa €/reseña**, y endurecimiento de seguridad (RLS de perfil, inyección de fórmulas). Ver [`CLAUDE.md`](CLAUDE.md) §3/§4 y §8 (Backlog v2) y [`spec.md`](spec.md) §9 (open questions).
>
> 📖 **Fuente de verdad del producto**: [`spec.md`](spec.md). Leer antes de añadir features o tomar decisiones de arquitectura.
> 📋 **Estado actual del proyecto, workarounds y comandos**: [`CLAUDE.md`](CLAUDE.md). Leer al abrir el repo en una máquina nueva.

**Roles**: Admin (gestor global), Director de oficina (admin de su equipo + comercial productor), Comercial (envía enlace al cliente tras la visita), Gestor de reseñas (solo lectura + exporta a Excel).

**Producción**: [`https://resenas.marinadorconstrucciones.com`](https://resenas.marinadorconstrucciones.com).

**Flujo**: comercial comparte `resenas.marinadorconstrucciones.com/c/{slug-comercial}/{slug-cliente}` → cliente abre y aterriza directamente en la ficha de Google → dos crons diarios (Google Places API + Google Business Profile API) + cron horario en GitHub Actions traen las reseñas → el algoritmo las atribuye al comercial mediante ventana temporal y nombre del cliente → el comercial recibe email de notificación (Brevo SMTP, batch al final del cron) y la reseña aparece en su panel.

---

## Stack

- **Next.js 15.5.18** App Router + TypeScript strict (`noUncheckedIndexedAccess`) + Turbopack
- **Supabase** Postgres + Auth + Row Level Security + Storage (bucket `avatars`)
- **Google Places API legacy** con API key (vía de respaldo activa — sin OAuth, `reviews_sort=newest`, top-5 más recientes por ficha)
- **Google Business Profile API** con OAuth por ficha (Account Management + Business Information + Reviews v4) — esperando aprobación de cuota
- **Brevo SMTP** dos claves independientes: una para Supabase Auth (magic-links + invites) y otra para notificaciones transaccionales (Nodemailer en [`lib/email/brevo.ts`](lib/email/brevo.ts))
- **Vercel Hobby** hosting + dos Vercel Crons diarios (`0 5 * * *` Places, `5 5 * * *` Business Profile UTC ≈ 6-7 AM España) + **GitHub Action horario** (cada hora 06-23 UTC) llamando al cron Places para fichas activas + botón **"Sincronizar ahora"** en UI (admin/gestor/comercial)
- **ExcelJS** (dynamic import server-side) para export mensual del gestor
- **qrcode.react** + Zod + middleware con RLS y redirección por rol
- **Vitest** unit tests (241 verdes — matcher + date-range (incl. periodo de comisión 20→20) + cliente Places + leaderboard + branding + messaging + role/route helpers + duplicate-detection + verification-gating + review-url + sales-report + orphan-reviews + low-rating-alerts + panel-motivation + panel-badges + sales-schemas + excel-safe + rls-self-update)
- **Playwright** E2E (login + admin-nav smoke; setup en [`playwright.config.ts`](playwright.config.ts) + helper de auth via `/login/manual`)
- **eslint-plugin-jsx-a11y** activo (preset `recommended`); 0 errors, deuda menor en modal backdrops como warnings documentadas
- **Content-Security-Policy** + HSTS + headers de seguridad en [`next.config.ts`](next.config.ts)

---

## Estado del producto

🏁 **V1 cerrada el 2026-05-26**. Producto live y **trayendo reseñas reales desde 2026-05-23** vía Google Places API (vía de respaldo). El cron oficial de Business Profile sigue activo en paralelo esperando la aprobación de cuota (caso `5-5855000041022`, ETA ~2026-06-04; verificado el 2026-06-04 que sigue a cuota 0, re-check 2026-06-09); cuando llegue, retomará automáticamente sin redeploy.

Por fase:

- **Fase 1 Foundation** — ✅ schema + RLS + middleware + landing + login.
- **Fase 2 Admin** — ✅ `/dashboard` con datos reales, `/comerciales` + `/comerciales/[slug]` editable, `/gestores`, `/fichas` con botón Conectar Google + UI selección Business Profile + edición de Place ID, `/resenas/verificacion` con confirm/reject/reassign.
- **Fase 3 Sales (desktop + mobile)** — ✅ `/panel` (con bloque "Histórico, ranking e insignias" + **periodo de comisión 20→20** como rango protagonista y **€ estimado**), `/panel/enlace`, `/panel/plantillas` (3 plantillas por cliente editables nombre+cuerpo, mig 019), `/panel/resenas`, `/clientes` con QR + selector de plantilla + deep-links, `/clientes/[slug]` con edición inline. Vista mobile (≤767px) con MobileTabBar + avatar fijo top-right.
- **v2 (jun 2026)** — ✅ panel "Histórico, ranking e insignias" (insignias derivadas, sin tabla); **periodo de comisión (20→20)** + **tarifa €/reseña por productor** (`profiles.commission_rate`, mig 020); blindaje RLS de auto-edición de perfil (mig 021/022); hardening de seguridad (inyección de fórmulas en Excel, propiedad de cliente en verificación). Detalle en [CLAUDE.md §4.34-4.37](CLAUDE.md).
- **Fase 4 Google Business Profile sync** — ⚠️ código 100% (OAuth, refresh-token, cliente API, matcher con ventana 48h + similitud + modo anonymous, cron con lock optimista + email batch, notificador Brevo). Esperando aprobación de Google a la cuota de la API.
- **Fase 4.b Places API fallback** — ✅ cron `/api/cron/sync-places-reviews` trae las 5 reseñas más recientes por ficha (Places API legacy con `reviews_sort=newest`) sin necesidad de OAuth + cron horario GitHub Action + botón "Sincronizar ahora" en UI. Detalle en [CLAUDE.md §3 Fase 4.b](CLAUDE.md).
- **Fase 5 Manager (Bel)** — ✅ comparte vista con admin en `/dashboard` y `/comerciales` con plenos permisos, `/manager/resenas` con filtros, `/manager/export` y endpoint `/api/export/reviews` con ExcelJS (dos hojas).
- **Perfil global** — ✅ `/perfil` accesible a los tres roles con avatar upload (bucket Storage).
- **Fase 6 Polish / hardening** — ✅ auditoría 18 items (críticos + altos + medios + bajos). Tests Vitest, `noUncheckedIndexedAccess`, CSP, índices compuestos, lock cron, email batch, etc. Detalle en [CLAUDE.md §3 Fase 6](CLAUDE.md).
- **Fase 7 Deploy producción** — ✅ live en `https://resenas.marinadorconstrucciones.com`.

---

## Cómo arrancar en local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Modo demo (sin Supabase)

Sin ningún `.env`, la app arranca igual con datos de demostración. Útil solo para revisar el diseño:

```bash
npm run dev
# abre http://localhost:3000
```

### 3. Conectar Supabase (datos reales)

1. Proyecto Supabase ya existente del equipo: `zejwmznusszqlwhevaqv` ([dashboard](https://supabase.com/dashboard/project/zejwmznusszqlwhevaqv)).
2. Crear `.env.local` desde `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL` → `https://zejwmznusszqlwhevaqv.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → publishable key (`sb_publishable_…`) desde Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` → secret key (`sb_secret_…`), misma pantalla.
   - `CRON_SECRET` → generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
3. Migraciones aplicadas (en orden) en SQL Editor del Dashboard:
   ```
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_rls_policies.sql
   supabase/migrations/003_seed_demo.sql              (opcional — datos demo)
   supabase/migrations/004_google_oauth.sql
   supabase/migrations/005_manager_sales_admin.sql
   supabase/migrations/006_profile_avatars.sql
   supabase/migrations/007_reviews_composite_indices.sql
   supabase/migrations/008_audit_log_insert_policy.sql
   supabase/migrations/009_review_source.sql
   supabase/migrations/010_review_removed_at.sql
   supabase/migrations/011_office_director_role.sql
   supabase/migrations/012_office_director_policies.sql
   supabase/migrations/013_director_team_scope.sql
   supabase/migrations/014_location_brand.sql
   supabase/migrations/015_review_duplicates.sql
   supabase/migrations/016_verification_open_to_all.sql
   supabase/migrations/017_low_rating_alerts.sql
   supabase/migrations/018_monthly_goal_default_5.sql
   supabase/migrations/019_sales_message_templates.sql
   supabase/migrations/020_commission_rate.sql
   supabase/migrations/021_profiles_self_update_lockdown.sql
   supabase/migrations/022_profiles_self_update_freeze_department.sql
   ```
4. Auth: usar el flujo OTP `token_hash` documentado en [CLAUDE.md §4.1](CLAUDE.md). Las plantillas de email en Supabase Dashboard → Authentication → Emails deben usar `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={email|invite}`.

### 4. Conectar Google — dos APIs distintas

ReseñaHub usa **dos APIs de Google** que viven en el mismo proyecto Cloud (`resenas-inseryal`, project number `628454280082`):

#### 4.A Google Places API (New) — activo, sin OAuth
Vía de respaldo que ya está trayendo reseñas reales en producción. Solo necesita una API key.

1. En [Google Cloud Console](https://console.cloud.google.com) → habilitar **Places API (New)**.
2. APIs & Services → Credentials → Create API key.
3. Restringir la key a **Places API (New)** (Application restrictions = None — Vercel usa IPs dinámicas).
4. Añadir a `.env.local`:
   ```
   GOOGLE_PLACES_API_KEY=AIza…
   ```
5. Cada ficha en `/fichas` debe tener su `google_place_id` rellenado (botón "Editar Place ID" en la fila).

#### 4.B Google Business Profile API — pendiente de aprobación
Cuando llegue la cuota, complementa a Places con paginación completa y datos más ricos.

1. APIs habilitadas: My Business Account Management + Business Information.
2. OAuth 2.0 Client ID (Web app) con redirect URI `http://localhost:3000/api/google/oauth/callback`. Añadir HTTPS prod cuando despleguéis.
3. OAuth consent screen en Testing con scopes `openid`, `email`, `https://www.googleapis.com/auth/business.manage` + test users autorizados (admins de Inseryal).
4. Rellenar `.env.local`:
   ```
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/oauth/callback
   ```
5. Solicitar acceso a la **Business Profile API** vía [el formulario oficial](https://support.google.com/business/contact/api_default). Sin esto la cuota está a 0 y todas las llamadas a `mybusiness*.googleapis.com` devuelven 429 RESOURCE_EXHAUSTED. ETA: 7-15 días hábiles.
6. Cuando Google apruebe: ir a [/fichas](http://localhost:3000/fichas) → "Conectar Google" en cada ficha → seleccionar Business Profile → vincular. Tras el primer run del cron, ejecutar el script de dedup descrito en [CLAUDE.md §8](CLAUDE.md).

### 5. Notificaciones por email (Brevo SMTP)

El cron envía email al comercial cuando entra una reseña con `match_state='counted'`. Brevo SMTP vía Nodemailer (`lib/email/brevo.ts`). Variables:

```
BREVO_SMTP_USER=7e1a24001@smtp-brevo.com
BREVO_SMTP_PASS=<smtp key 'resenahub-app' de Brevo>
BREVO_FROM_EMAIL=info@marinadorconstrucciones.com
```

Sin estas vars, el cron logea y sigue (el envío se salta gracefully).

Detalles sobre Brevo, las dos claves SMTP independientes y el whitelist de IPs en [CLAUDE.md §4.12-4.13](CLAUDE.md).

### 6. Crons en producción

[`vercel.json`](vercel.json) configura **dos crons diarios** apuntando a endpoints distintos:
- `0 5 * * *` UTC → `/api/cron/sync-places-reviews` (Places API, activo)
- `5 5 * * *` UTC → `/api/cron/sync-google-reviews` (Business Profile, esperando cuota)

Ambos a las 5:00/5:05 UTC ≈ 6-7 AM hora española. Vercel firma cada request con `Authorization: Bearer $CRON_SECRET` (validado con `timingSafeEqual`). Vercel Hobby no admite schedules sub-diarios; ver [CLAUDE.md §4.11](CLAUDE.md) para alternativas si urge inmediatez.

Ambos crons comparten el helper [`lib/cron/process-reviews.ts`](lib/cron/process-reviews.ts) (matcher + insert + acumulación de notificaciones email + flush en batch) y un lock optimista por location (`oauth_last_sync_at < now() - 60s`). El cron Business Profile añade paginación con `nextPageToken` (MAX_PAGES=10) + early-exit cuando una página ya está sincronizada.

Para lanzar los crons a mano en local:

```bash
set -a && source .env.local && set +a && \
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/sync-places-reviews

set -a && source .env.local && set +a && \
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/sync-google-reviews
```

---

## Rutas y rol que ve cada una

| Ruta                            | Rol               | Qué hace                                                         |
|--------------------------------|-------------------|------------------------------------------------------------------|
| `/login`                       | público           | Magic-link via Brevo                                             |
| `/login/manual?token=...`      | público           | Workaround para Supabase rate-limit, ver [CLAUDE.md §4.2](CLAUDE.md) |
| `/auth/confirm`                | público           | Verifica `token_hash` + setea sesión (HEAD vacío vs email scanners) |
| `/c/:sales/:client`            | público           | Registra share_link y 302 a Google                               |
| `/privacidad`, `/terminos`     | público           | Páginas legales (linkadas desde login)                           |
| `/perfil`                      | admin + sales + manager | Foto + datos de cuenta + cerrar sesión                     |
| `/ayuda`                       | admin + sales + manager + director | Manual del comercial v2 (14 secciones + glosario + 15 capturas + lightbox) |
| `/dashboard`                   | admin + manager   | KPIs reales: ≤2★/comerciales/fichas/reseñas + chart reseñas 6 meses + banner alertas + leaderboard |
| `/comerciales`                 | admin + manager + office_director | Lista + invite + card "Exportar resultados" con RangePicker |
| `/comerciales/:slug`           | admin + manager + office_director | Ficha editable: KPIs, clientes, reseñas + bot. "Descargar Excel" individual |
| `/directores`                  | admin + manager   | Lista + invite + delete de directores de oficina (mig 011)       |
| `/gestores`                    | admin             | Lista + invite + delete de gestores                              |
| `/fichas`                      | admin + office_director | Lista + Conectar/Desconectar Google                        |
| `/fichas/:id/conectar`         | admin + office_director | UI selección de Business Profile location                  |
| `/resenas/verificacion`        | 4 roles (mig 016) | Bandeja pending/unmatched/eliminadas + confirm/reject/reassign/marcar eliminada/claim |
| `/panel`                       | sales             | KPIs propios + RangePicker + proyección ETA + card mobile clientes |
| `/panel/enlace`                | sales             | URL + QR + plantilla genérica editable + deep-links + card a "Mis plantillas" |
| `/panel/plantillas`            | sales             | Editor de las 3 plantillas por cliente (nombre + cuerpo), guardadas en `profiles.message_templates` (mig 019) |
| `/panel/resenas`               | sales             | Histórico de reseñas atribuidas con RangePicker + bot. "Descargar Excel" propio |
| `/panel/ranking`               | sales             | Ranking de su equipo (sales con mismo `director_id`) en mobile cards |
| `/ranking`                     | admin + manager + office_director | Ranking completo desktop (todos los productores según RLS) |
| `/clientes`                    | sales             | Lista + alta + dialog QR + selector de 3 plantillas/deep-links   |
| `/clientes/:slug`              | sales             | Ficha cliente editable + visitas (info contextual del comercial) + reseñas atribuidas + botón "Buscar reseñas" |
| `/manager/resenas`             | reviews_manager + admin | Lista global de reseñas con filtros                        |
| `/manager/export`              | reviews_manager + admin | Descarga del Excel mensual                                 |
| `/api/google/oauth/start`      | admin             | Inicia consent OAuth con state CSRF                              |
| `/api/google/oauth/callback`   | público (Google)  | Token swap + redirige a `/fichas/:id/conectar`                   |
| `/api/cron/sync-google-reviews`| `Bearer CRON_SECRET` | Sincroniza reseñas Business Profile + matcher + email batch  |
| `/api/cron/sync-places-reviews`| `Bearer CRON_SECRET` | Sincroniza reseñas Places API + matcher + email batch         |
| `/api/sync/now`                | admin + manager + sales | Sync manual on-demand. Admin/manager → todas o location_id concreto. Sales → solo su ficha asignada. |
| `/api/export/reviews`          | admin + manager + office_director | Excel global (4 hojas departamentales + Detalle) con ExcelJS dynamic import |
| `/api/export/sales/[id]`       | admin + manager + office_director + sales (self) | Excel individual del comercial (cabecera + tabla con hyperlinks Google) |
| `/api/admin/notify-failed`     | admin             | GET lista + POST reintenta emails de notificación fallidos      |

---

## Scripts

```bash
npm run dev          # Next dev con Turbopack
npm run build        # Build producción
npm run start        # Server producción
npm run typecheck    # tsc --noEmit (gate antes de cerrar tareas)
npm run lint         # next lint (eslint-config-next + jsx-a11y/recommended)
npm test             # Vitest unit tests (241 verdes)
npm run test:watch   # Vitest en modo watch
npm run test:e2e     # Playwright E2E (login + admin-nav). Primera vez: npx playwright install --with-deps chromium
npm run test:e2e:ui  # Playwright en modo UI interactivo
```

---

## Estructura

```
app/
  (admin)/              ─ Pantallas del rol admin
    dashboard/
    comerciales/[slug]/
    gestores/
    fichas/[id]/conectar/
    resenas/verificacion/
    ajustes/                         (oculto del sidebar, stub ComingSoon)
  (sales)/              ─ Pantallas del comercial
    panel/
    panel/enlace/                    "Sala de armas" URL + QR + plantilla genérica
    panel/plantillas/                Editor de las 3 plantillas por cliente (nombre + cuerpo)
    panel/resenas/                   Histórico personal
    panel/ranking/                   Ranking del equipo del comercial (mobile cards)
    clientes/[slug]/
  (manager)/            ─ Pantallas del gestor de reseñas
    manager/resenas/
    manager/export/
  (profile)/            ─ Pantallas accesibles a los 3 roles
    perfil/                          Foto + datos de cuenta + cerrar sesión
    ayuda/                           Manual del comercial con capturas + lightbox
  (legal)/              ─ Privacidad + términos (públicas)
    privacidad/
    terminos/
  c/[salesSlug]/        ─ Landing pública del enlace personalizado
  auth/confirm/         ─ Verify OTP token_hash + setea sesión (HEAD vacío)
  api/
    google/oauth/{start,callback}/   ─ Flujo OAuth (Business Profile)
    cron/sync-google-reviews/        ─ Cron Business Profile + lock optimista + email batch
    cron/sync-places-reviews/        ─ Cron Places API (fallback sin OAuth)
    sync/now/                        ─ Sync manual on-demand por usuario autenticado
    export/reviews/                  ─ Endpoint .xlsx con ExcelJS dynamic
    admin/notify-failed/             ─ Admin: listar + reenviar emails fallidos
  login/                ─ /login + /login/manual (workaround tokens)
components/
  ui/                   ─ Card, Stat, Pill, Avatar, Stars, Progress, RangePicker,
                          SyncNowButton, RemovalControls, Badge, FormField, …
  panel/                ─ MonthlyEvolutionCard, RecentReviewsCard, TeamRankSummary, BadgesCard
  charts/               ─ Sparkline, AreaChart, MonthBars, Ring
  ranking/              ─ LeaderboardTable, LeaderboardCardList
  layout/               ─ Frame, Sidebar, Topbar, MobileTabBar, MobileProfileAvatar
  help/HelpFigure       ─ Imagen del manual /ayuda con placeholder + lightbox

public/help/            ─ Capturas del manual (01-09 + README.md con instrucciones)

lib/
  google/business-profile.ts        ─ Cliente API + refresh-token + fetchWithRetry
  google/places.ts                  ─ Cliente Places API legacy (reviews_sort=newest)
  google/__tests__/places.test.ts   ─ Tests Vitest del cliente Places (20)
  matching/attribute-review.ts      ─ Algoritmo (ventana 48h + nombre + modo anonymous)
  matching/__tests__/               ─ Tests Vitest del matcher (22)
  cron/process-reviews.ts           ─ Helper compartido (matcher + insert + notif batch + anti-fraude fail-safe)
  cron/duplicate-detection.ts       ─ Anti-fraude (decideFromPrincipals/decideDuplicateForClient/promoteNextPrincipal)
  email/{brevo,notify-new-review}   ─ Wrapper Brevo SMTP + plantilla HTML escapada
  supabase/{client,server,middleware,service,types,config}
  audit.ts              ─ recordAudit() con service-client
  messaging.ts          ─ 3 plantillas por cliente (resolveTemplate/resolveLabel) + genérica + deep-links
  panel-badges.ts       ─ computePanelBadges() — insignias derivadas (sin tabla)
  panel-motivation.ts   ─ getMotivationSuffix() — copy del callout por día/estado
  validation/sales-schemas.ts       ─ Zod compartido (commissionRate/department/pauseReason)
  constants.ts          ─ DEPARTMENT/STATUS/PAUSE_REASON_OPTIONS (UI compartida)
  format.ts             ─ formatReviewDate/formatDateTime + matchStateLabel/Tone
  reports/{weekly,sales}-report.ts  ─ Excel global + individual (ExcelJS)
  reports/excel-safe.ts             ─ excelSafe() anti-inyección de fórmulas
  url-validation.ts     ─ isSafeNext / isValidSlug
  date-range.ts         ─ parseRange (+fallback), commissionPeriodRange (20→20), bucketByMonth, …
  __tests__/            ─ Tests Vitest: date-range, leaderboard, panel-badges, sales-schemas, rls-self-update, …
  utils.ts              ─ cn, slugify (translitera cirílico→latino), transliterateCyrillic, initials, avatarColor, formatEuro
supabase/migrations/    ─ 001 schema, 002 RLS, 003 seed, 004 google_oauth,
                         005 manager_sales_admin, 006 profile_avatars,
                         007 reviews_composite_indices, 008 audit_log_insert_policy,
                         009 review_source (enum business_profile/places_api/manual),
                         010 review_removed_at (soft delete + view reviews_active),
                         011-013 office_director (role, policies, team scope por director_id),
                         014 location_brand (enum inseryal/marina_dor_construcciones),
                         015 review_duplicates (is_duplicate boolean + backfill anti-fraude),
                         016 verification_open_to_all (unmatched visible a sales/director),
                         017 low_rating_alerts (low_rating_alerted_at + índice parcial),
                         018 monthly_goal_default_5,
                         019 sales_message_templates (profiles.message_templates jsonb),
                         020 commission_rate (profiles.commission_rate numeric — tarifa €/reseña),
                         021 profiles_self_update_lockdown (congela columnas sensibles en RLS),
                         022 profiles_self_update_freeze_department (addendum: + department/language)
e2e/                    ─ Playwright specs (login + admin-nav) + helpers/auth.ts
test/                   ─ server-only-stub.ts (para que Vitest importe módulos server-only)
middleware.ts           ─ Auth + roles + redirección por rol
vercel.json             ─ Crons diarios 0 5 * * * (Places) y 5 5 * * * (Business Profile) UTC
vitest.config.ts        ─ Alias @/* + stub server-only
next.config.ts          ─ Headers de seguridad (CSP completo + HSTS + …)
_design_package/        ─ Bundle original de diseño (referencia, no se toca)
```

---

## Setup en una máquina nueva

`.env.local` está en `.gitignore` → no viaja entre Macs. En cada máquina:

1. `git clone https://github.com/acastillocanton/rese-as-hub.git && cd rese-as-hub`
2. `npm install`
3. Copiar `.env.example` → `.env.local` y rellenar las claves de Supabase (publishable + service-role) + Google (client id + secret + redirect URI) + Brevo SMTP (opcional para emails reales en dev).
4. `npm run dev` → http://localhost:3000.
5. Iniciar sesión en `/login` con un email autorizado en `profiles` (admin de Inseryal). Vía magic-link (Brevo) o, si Brevo está caído, `/login/manual?token=<hashed_token>` con la receta de CLAUDE.md §4.2.

⚠️ Las keys de Supabase usan el **nuevo formato** `sb_publishable_*` / `sb_secret_*`. No las JWT antiguas (`eyJhbGc…`).

---

## Más detalle operativo

- Workarounds activos, restricciones y "no toques esto" → [CLAUDE.md §4](CLAUDE.md).
- Estado real de la base de datos (entidades sembradas) → [CLAUDE.md §7](CLAUDE.md).
- Decisión pendiente / open questions → [spec.md §9](spec.md).
