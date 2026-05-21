# ReseñaHub

Plataforma interna de Inseryal by Marina d'Or para gestionar reseñas de Google Business Profile por comercial.

> 📖 **Fuente de verdad del producto**: [`spec.md`](spec.md). Leer antes de añadir features o tomar decisiones de arquitectura.
> 📋 **Estado actual del proyecto, workarounds y comandos**: [`CLAUDE.md`](CLAUDE.md). Leer al abrir el repo en una máquina nueva.

**Roles**: Admin (gestor global), Comercial (envía enlace al cliente tras la visita), Gestor de reseñas (solo lectura + exporta a Excel).

**Flujo**: comercial comparte `reseñahub.es/c/{slug-comercial}/{slug-cliente}` → cliente abre y aterriza directamente en la ficha de Google → el cron sincroniza la reseña vía Google Business Profile API → el algoritmo la atribuye al comercial mediante ventana temporal y nombre del cliente → el comercial recibe email de notificación (Resend) y la reseña aparece en su panel.

---

## Stack

- **Next.js 15** App Router + TypeScript strict + Turbopack
- **Supabase** Postgres + Auth + Row Level Security
- **Google Business Profile API** (OAuth por ficha — Account Management + Business Information + Reviews v4)
- **Brevo** SMTP para los magic-links de auth (vía Supabase Auth)
- **Resend** transaccional para notificaciones de nueva reseña al comercial
- **Vercel** hosting + Cron
- **ExcelJS** export mensual del gestor de reseñas
- **qrcode.react** + Zod + middleware con RLS y redirección por rol

---

## Estado del producto

Producto cerrado funcionalmente. Único bloqueo activo: aprobación de Google a la Business Profile API (caso `5-5855000041022`, ETA ~2026-06-04). Mientras tanto el resto del producto opera con normalidad.

Por fase:

- **Fase 1 Foundation** — ✅ schema + RLS + middleware + landing + login.
- **Fase 2 Admin** — ✅ `/dashboard` con datos reales, `/comerciales` + `/comerciales/[slug]` editable, `/fichas` con botón Conectar Google + UI selección Business Profile, `/resenas/verificacion` con confirm/reject/reassign.
- **Fase 3 Sales** — ✅ `/panel`, `/clientes` con QR + plantilla editable + deep-links, `/clientes/[slug]` con edición inline.
- **Fase 4 Google sync** — ⚠️ código 100% (OAuth, refresh-token, cliente API, matcher con ventana 48h + similitud, cron, notificador Resend). Esperando aprobación de Google a la cuota de la API.
- **Fase 5 Manager (Raquel)** — ✅ `/manager/comerciales`, `/manager/resenas` con filtros, `/manager/export` y endpoint `/api/export/reviews` con ExcelJS (dos hojas).
- **Fase 6 Polish** — opcional: a11y, loading states, tests Vitest + Playwright.

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
   supabase/migrations/004_google_oauth.sql
   ```
   (`003_seed_demo.sql` es opcional con datos de prueba.)
4. Auth: usar el flujo OTP `token_hash` documentado en [CLAUDE.md §4.1](CLAUDE.md). Las plantillas de email en Supabase Dashboard → Authentication → Emails deben usar `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={magiclink|invite}`.

### 4. Conectar Google Business Profile

1. Proyecto en [Google Cloud Console](https://console.cloud.google.com): `628454280082`.
2. APIs habilitadas: My Business Account Management + Business Information.
3. OAuth 2.0 Client ID (Web app) con redirect URI `http://localhost:3000/api/google/oauth/callback`. Añadir HTTPS prod cuando despleguéis.
4. OAuth consent screen en Testing con scopes `openid`, `email`, `https://www.googleapis.com/auth/business.manage` + test users autorizados (admins de Inseryal).
5. Rellenar `.env.local`:
   ```
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/oauth/callback
   ```
6. Solicitar acceso a la **Business Profile API** vía [el formulario oficial](https://support.google.com/business/contact/api_default). Sin esto la cuota está a 0 y todas las llamadas a `mybusiness*.googleapis.com` devuelven 429 RESOURCE_EXHAUSTED. ETA: 7-15 días hábiles.
7. Cuando Google apruebe: ir a [/fichas](http://localhost:3000/fichas) → "Conectar Google" en cada ficha → seleccionar Business Profile → vincular.

### 5. Notificaciones Resend (opcional)

Para que el cron envíe email al comercial cuando atribuye una reseña:

```
RESEND_API_KEY=re_…
RESEND_FROM_EMAIL=ReseñaHub <notificaciones@reseñahub.es>
```

Sin la key, el cron logea y sigue (el envío se salta gracefully).

### 6. Cron en producción

[`vercel.json`](vercel.json) ya configura `*/10 * * * *` apuntando a `/api/cron/sync-google-reviews`. Vercel firma cada request con `Authorization: Bearer $CRON_SECRET`.

Para lanzar el cron a mano en local:

```bash
set -a && source .env.local && set +a && \
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/sync-google-reviews
```

---

## Rutas y rol que ve cada una

| Ruta                            | Rol               | Qué hace                                                         |
|--------------------------------|-------------------|------------------------------------------------------------------|
| `/login`                       | público           | Magic-link via Brevo                                             |
| `/auth/confirm`                | público           | Verifica `token_hash` + setea sesión                             |
| `/c/:sales/:client`            | público           | Registra share_link y 302 a Google                               |
| `/privacidad`, `/terminos`     | público           | Páginas legales (borradores pendientes revisión jurídica)        |
| `/dashboard`                   | admin             | KPIs reales: visitas/comerciales/fichas + chart 6 meses + leaderboard |
| `/comerciales`                 | admin             | Lista + invite + delete + fila navegable                         |
| `/comerciales/:slug`           | admin             | Ficha editable: datos, KPIs, clientes, reseñas                   |
| `/fichas`                      | admin             | Lista + Conectar/Desconectar Google                              |
| `/fichas/:id/conectar`         | admin             | UI selección de Business Profile location                        |
| `/resenas/verificacion`        | admin             | Bandeja pending/unmatched + confirm/reject/reassign              |
| `/panel`                       | sales             | KPIs propios + enlace personal + plantilla                       |
| `/clientes`                    | sales             | Lista + alta + dialog QR/plantilla/deep-links                    |
| `/clientes/:slug`              | sales             | Ficha cliente editable + visitas + reseñas atribuidas            |
| `/manager/comerciales`         | reviews_manager   | Lista read-only de comerciales                                   |
| `/manager/comerciales/:slug`   | reviews_manager   | Ficha read-only del comercial                                    |
| `/manager/resenas`             | reviews_manager   | Lista de reseñas con filtros                                     |
| `/manager/export`              | reviews_manager   | Descarga del Excel mensual                                       |
| `/api/google/oauth/start`      | admin             | Inicia consent OAuth con state CSRF                              |
| `/api/google/oauth/callback`   | público (Google)  | Token swap + redirige a `/fichas/:id/conectar`                   |
| `/api/cron/sync-google-reviews`| `Bearer CRON_SECRET` | Sincroniza reseñas + ejecuta matcher + notifica                |
| `/api/export/reviews`          | admin + manager   | Devuelve `.xlsx` con ExcelJS                                     |

---

## Scripts

```bash
npm run dev         # Next dev con Turbopack
npm run build       # Build producción
npm run start       # Server producción
npm run typecheck   # tsc --noEmit (gate antes de cerrar tareas)
npm run lint        # next lint
```

---

## Estructura

```
app/
  (admin)/              ─ Pantallas del rol admin
    dashboard/
    comerciales/[slug]/
    fichas/[id]/conectar/
    resenas/verificacion/
    ajustes/
  (sales)/              ─ Pantallas del comercial
    panel/
    clientes/[slug]/
  (manager)/            ─ Pantallas del gestor de reseñas (Raquel)
    manager/comerciales/[slug]/
    manager/resenas/
    manager/export/
  (legal)/              ─ Privacidad + términos (públicas)
    privacidad/
    terminos/
  c/[salesSlug]/        ─ Landing pública del enlace personalizado
  auth/confirm/         ─ Verify OTP token_hash + setea sesión
  api/
    google/oauth/{start,callback}/   ─ Flujo OAuth
    cron/sync-google-reviews/        ─ Cron de sincronización
    export/reviews/                  ─ Endpoint .xlsx
  login/                ─ /login + /login/manual (workaround tokens)
components/
  ui/                   ─ Card, Stat, Pill, Avatar, Stars, Progress, Seg…
  charts/               ─ Sparkline, AreaChart, MonthBars, Ring
  layout/               ─ Frame, Sidebar (con usePathname), Topbar
lib/
  google/business-profile.ts        ─ Cliente API + refresh-token
  matching/attribute-review.ts      ─ Algoritmo (ventana 48h + nombre)
  email/{resend,notify-new-review}  ─ Wrapper Resend + plantilla
  supabase/{client,server,middleware,service,types,config}
  messaging.ts          ─ Plantilla por defecto + deep-links WhatsApp/Email/SMS
  url-validation.ts     ─ isSafeNext / isValidSlug
  utils.ts              ─ cn, slugify, initials, avatarColor
supabase/migrations/    ─ 001 schema, 002 RLS, 003 seed, 004 google_oauth
middleware.ts           ─ Auth + roles + redirección por rol
vercel.json             ─ Cron config */10 * * * *
_design_package/        ─ Bundle original de diseño (referencia, no se toca)
```

---

## Setup en una máquina nueva

`.env.local` está en `.gitignore` → no viaja entre Macs. En cada máquina:

1. `git clone https://github.com/acastillocanton/rese-as-hub.git && cd rese-as-hub`
2. `npm install`
3. Copiar `.env.example` → `.env.local` y rellenar las claves de Supabase (publishable + service-role) + Google (client id + secret + redirect URI) + Resend (opcional).
4. `npm run dev` → http://localhost:3000.
5. Iniciar sesión en `/login` con un email autorizado en `profiles` (admin de Inseryal). Vía magic-link (Brevo) o, si Brevo está caído, `/login/manual?token=<hashed_token>` con la receta de CLAUDE.md §4.2.

⚠️ Las keys de Supabase usan el **nuevo formato** `sb_publishable_*` / `sb_secret_*`. No las JWT antiguas (`eyJhbGc…`).

---

## Más detalle operativo

- Workarounds activos, restricciones y "no toques esto" → [CLAUDE.md §4](CLAUDE.md).
- Estado real de la base de datos (entidades sembradas) → [CLAUDE.md §7](CLAUDE.md).
- Decisión pendiente / open questions → [spec.md §9](spec.md).
