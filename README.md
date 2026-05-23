# ReseñaHub

Plataforma interna de Inseryal by Marina d'Or para gestionar reseñas de Google Business Profile por comercial.

> 📖 **Fuente de verdad del producto**: [`spec.md`](spec.md). Leer antes de añadir features o tomar decisiones de arquitectura.
> 📋 **Estado actual del proyecto, workarounds y comandos**: [`CLAUDE.md`](CLAUDE.md). Leer al abrir el repo en una máquina nueva.

**Roles**: Admin (gestor global), Comercial (envía enlace al cliente tras la visita), Gestor de reseñas (solo lectura + exporta a Excel).

**Producción**: [`https://resenas.marinadorconstrucciones.com`](https://resenas.marinadorconstrucciones.com).

**Flujo**: comercial comparte `resenas.marinadorconstrucciones.com/c/{slug-comercial}/{slug-cliente}` → cliente abre y aterriza directamente en la ficha de Google → dos crons diarios (Google Places API + Google Business Profile API) traen las reseñas → el algoritmo las atribuye al comercial mediante ventana temporal y nombre del cliente → el comercial recibe email de notificación (Brevo SMTP, batch al final del cron) y la reseña aparece en su panel. Plus: importador manual `/manager/resenas/importar` para reseñas puntuales que la API no devuelve.

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
- **Vitest** unit tests (matcher + date-range + schema importador + cliente Places, 70 verdes)
- **Content-Security-Policy** + HSTS + headers de seguridad en [`next.config.ts`](next.config.ts)

---

## Estado del producto

Producto cerrado funcionalmente y **trayendo reseñas reales desde 2026-05-23** vía Google Places API (vía de respaldo). El cron oficial de Business Profile sigue activo en paralelo esperando la aprobación de cuota (caso `5-5855000041022`, ETA ~2026-06-04); cuando llegue, retomará automáticamente sin redeploy.

Por fase:

- **Fase 1 Foundation** — ✅ schema + RLS + middleware + landing + login.
- **Fase 2 Admin** — ✅ `/dashboard` con datos reales, `/comerciales` + `/comerciales/[slug]` editable, `/gestores`, `/fichas` con botón Conectar Google + UI selección Business Profile + edición de Place ID, `/resenas/verificacion` con confirm/reject/reassign.
- **Fase 3 Sales (desktop + mobile)** — ✅ `/panel`, `/panel/enlace`, `/panel/resenas`, `/clientes` con QR + plantilla editable + deep-links, `/clientes/[slug]` con edición inline. Vista mobile (≤767px) con MobileTabBar + avatar fijo top-right.
- **Fase 4 Google Business Profile sync** — ⚠️ código 100% (OAuth, refresh-token, cliente API, matcher con ventana 48h + similitud + modo anonymous, cron con lock optimista + email batch, notificador Brevo). Esperando aprobación de Google a la cuota de la API.
- **Fase 4.b Places API fallback + importador manual** — ✅ cron `/api/cron/sync-places-reviews` trae top-5 reseñas/ficha diariamente vía Google Places API (New) sin OAuth + pantalla `/manager/resenas/importar` para meter reseñas a mano. Detalle en [CLAUDE.md §3 Fase 4.b](CLAUDE.md).
- **Fase 5 Manager (Raquel + Bel)** — ✅ comparte vista con admin en `/dashboard` y `/comerciales` con plenos permisos, `/manager/resenas` con filtros, `/manager/export` y endpoint `/api/export/reviews` con ExcelJS (dos hojas).
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
| `/dashboard`                   | admin + manager   | KPIs reales: visitas/comerciales/fichas + chart 6 meses + leaderboard |
| `/comerciales`                 | admin + manager   | Lista + invite + delete + fila navegable                         |
| `/comerciales/:slug`           | admin + manager   | Ficha editable: datos, KPIs, clientes, reseñas                   |
| `/gestores`                    | admin             | Lista + invite + delete de gestores                              |
| `/fichas`                      | admin             | Lista + Conectar/Desconectar Google                              |
| `/fichas/:id/conectar`         | admin             | UI selección de Business Profile location                        |
| `/resenas/verificacion`        | admin             | Bandeja pending/unmatched/eliminadas + confirm/reject/reassign/marcar eliminada |
| `/panel`                       | sales             | KPIs propios + RangePicker + proyección ETA + card mobile clientes |
| `/panel/enlace`                | sales             | URL + QR + plantilla editable + deep-links WhatsApp/Email/SMS    |
| `/panel/resenas`               | sales             | Histórico de reseñas atribuidas con RangePicker                  |
| `/panel/ranking`               | sales             | Placeholder ComingSoon (Fase futura)                             |
| `/clientes`                    | sales             | Lista + alta + dialog QR/plantilla/deep-links                    |
| `/clientes/:slug`              | sales             | Ficha cliente editable + visitas + reseñas atribuidas            |
| `/manager/resenas`             | reviews_manager + admin | Lista global de reseñas con filtros                        |
| `/manager/resenas/importar`    | reviews_manager + admin | Form para meter reseñas a mano (con o sin atribución forzada) |
| `/manager/export`              | reviews_manager + admin | Descarga del Excel mensual                                 |
| `/api/google/oauth/start`      | admin             | Inicia consent OAuth con state CSRF                              |
| `/api/google/oauth/callback`   | público (Google)  | Token swap + redirige a `/fichas/:id/conectar`                   |
| `/api/cron/sync-google-reviews`| `Bearer CRON_SECRET` | Sincroniza reseñas Business Profile + matcher + email batch  |
| `/api/cron/sync-places-reviews`| `Bearer CRON_SECRET` | Sincroniza reseñas Places API + matcher + email batch         |
| `/api/sync/now`                | admin + manager + sales | Sync manual on-demand. Admin/manager → todas o location_id concreto. Sales → solo su ficha asignada. |
| `/api/export/reviews`          | admin + manager   | Devuelve `.xlsx` con ExcelJS (límite 5000 reviews defensivo)    |
| `/api/admin/notify-failed`     | admin             | GET lista + POST reintenta emails de notificación fallidos      |

---

## Scripts

```bash
npm run dev          # Next dev con Turbopack
npm run build        # Build producción
npm run start        # Server producción
npm run typecheck    # tsc --noEmit (gate antes de cerrar tareas)
npm run lint         # next lint
npm test             # Vitest unit tests (matcher + date-range)
npm run test:watch   # Vitest en modo watch
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
    panel/enlace/                    "Sala de armas" URL + QR + plantilla
    panel/resenas/                   Histórico personal
    panel/ranking/                   Placeholder ComingSoon
    clientes/[slug]/
  (manager)/            ─ Pantallas del gestor de reseñas
    manager/resenas/
    manager/resenas/importar/    Importador manual (admin + manager)
    manager/export/
  (profile)/            ─ Perfil global accesible a los 3 roles
    perfil/
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
  ui/                   ─ Card, Stat, Pill, Avatar, Stars, Progress, RangePicker, …
  charts/               ─ Sparkline, AreaChart, MonthBars, Ring
  layout/               ─ Frame, Sidebar, Topbar, MobileTabBar, MobileProfileAvatar
lib/
  google/business-profile.ts        ─ Cliente API + refresh-token + fetchWithRetry
  google/places.ts                  ─ Cliente Places API (New) v1 — sin OAuth
  google/__tests__/places.test.ts   ─ Tests Vitest del cliente Places (20)
  matching/attribute-review.ts      ─ Algoritmo (ventana 48h + nombre + modo anonymous)
  matching/__tests__/               ─ Tests Vitest del matcher (22)
  cron/process-reviews.ts           ─ Helper compartido (matcher + insert + notif batch)
  email/{brevo,notify-new-review}   ─ Wrapper Brevo SMTP + plantilla HTML escapada
  supabase/{client,server,middleware,service,types,config}
  audit.ts              ─ recordAudit() con service-client
  messaging.ts          ─ Plantilla por defecto + deep-links WhatsApp/Email/SMS
  url-validation.ts     ─ isSafeNext / isValidSlug
  date-range.ts         ─ parseRange, thisMonthRange, defaultShortcuts
  __tests__/            ─ Tests Vitest de date-range (14)
  utils.ts              ─ cn, slugify, initials, avatarColor
supabase/migrations/    ─ 001 schema, 002 RLS, 003 seed, 004 google_oauth,
                         005 manager_sales_admin, 006 profile_avatars,
                         007 reviews_composite_indices, 008 audit_log_insert_policy,
                         009 review_source (enum business_profile/places_api/manual)
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
