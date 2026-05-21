# ReseñaHub

Plataforma interna de Inseryal by Marina d'Or para gestionar reseñas de Google Business Profile por comercial.

> 📖 **La fuente de verdad del producto está en [`spec.md`](spec.md)** — leerla antes de añadir features o tomar decisiones de arquitectura.
> 📋 **El estado actual del proyecto y los workarounds operativos están en [`CLAUDE.md`](CLAUDE.md)** — leerlo al abrir el repo en una máquina nueva.

**Roles**: Admin (gestor global), Comercial (envía enlace al cliente tras la visita), Gestor de reseñas (solo lectura + exporta a Excel).
**Flujo**: comercial comparte `reseñahub.es/c/{slug-comercial}/{slug-cliente}` → cliente abre y aterriza directamente en la ficha de Google → el cron sincroniza la reseña vía Google Business Profile API → la app la atribuye automáticamente al comercial mediante ventana temporal y nombre del cliente codificado en el enlace.

---

## Stack

- Next.js 15 (App Router, TypeScript, Turbopack)
- Supabase (Postgres + Auth + Row Level Security)
- Google Business Profile API (OAuth por ficha)
- Resend (email transaccional)
- Vercel (hosting + cron)

---

## Cómo arrancar en local

### 1. Instalar dependencias

```bash
npm install
```

### 2. (Opcional) Levantar sin Supabase — modo demo

Sin ningún `.env`, la app arranca igualmente con datos de demostración: el middleware deja pasar todas las rutas y los layouts muestran un usuario placeholder. Útil para revisar el diseño.

```bash
npm run dev
# abre http://localhost:3000
```

Rutas navegables sin auth:

| Ruta                                     | Qué se ve                                       |
|------------------------------------------|-------------------------------------------------|
| `/dashboard`                             | Dashboard del admin con datos demo              |
| `/comerciales`                           | Listado de comerciales (placeholder)            |
| `/comerciales/carla-ruiz`                | Ficha individual (placeholder)                  |
| `/resenas/verificacion`                  | Motor de verificación (placeholder)             |
| `/fichas`                                | Fichas de Google Business (placeholder)         |
| `/panel`                                 | Panel del comercial con datos demo              |
| `/clientes`                              | Alta cliente (placeholder)                      |
| `/manager/resenas`                       | Lista solo-lectura para Raquel (placeholder)    |
| `/c/carla-ruiz`                          | Landing pública → redirige a Google             |
| `/c/carla-ruiz/maria-gonzalez`           | Landing con cliente identificado                |

### 3. Conectar Supabase (auth real)

1. Crea un proyecto nuevo en https://supabase.com.
2. Copia `.env.example` → `.env.local` y rellena:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)
3. En el SQL Editor del dashboard de Supabase, ejecuta en orden:
   ```sql
   -- supabase/migrations/001_initial_schema.sql
   -- supabase/migrations/002_rls_policies.sql
   -- supabase/migrations/003_seed_demo.sql
   ```
4. En **Authentication → Providers**, activa email + magic link y desactiva email signup público (solo invitaciones).
5. Crea tu primer admin desde el panel de Supabase (Auth → Users → Invite user). Luego, en SQL Editor:
   ```sql
   insert into public.profiles (id, full_name, role, slug, status)
   values ('<uuid-del-user>', 'Tu Nombre', 'admin', 'tu-nombre', 'active');
   ```
6. Vuelve a arrancar `npm run dev` y entra en `/login`.

### 4. Conectar Google Business Profile (verificación automática)

En desarrollo Future feature: actualmente la pantalla `/fichas` y el cron son placeholders. Cuando vayamos a Fase 4 del plan:

1. Habilita la **Business Profile API** en Google Cloud Console.
2. Configura OAuth 2.0 (consent screen + client web).
3. Rellena `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`.
4. Desde `/fichas`, conecta cada cuenta de Google que sea propietaria de las fichas.

### 5. Cron (Vercel)

Cuando despleguéis a Vercel, añadid `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/sync-google-reviews", "schedule": "*/10 * * * *" }
  ]
}
```

Vercel firmará la request con `Authorization: Bearer $CRON_SECRET`. Genera el secret con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Scripts

```bash
npm run dev         # Next dev con Turbopack
npm run build       # Build producción
npm run start       # Server producción
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
```

---

## Estructura

```
app/
  (admin)/          # Pantallas del rol admin (dashboard, comerciales, fichas...)
  (sales)/          # Pantallas del rol comercial (panel, clientes)
  (manager)/        # Pantallas del rol gestor de reseñas
  c/[salesSlug]/    # Landing pública sin auth
  auth/             # Magic-link callback + signout
  api/cron/         # Cron de sincronización con Google
  login/            # Pantalla de login
components/
  ui/               # Card, Stat, GhostBtn, Avatar, Stars, Progress, Seg, Pill, DateRange
  charts/           # Sparkline, MonthBars, AreaChart, Ring
  layout/           # Frame, Sidebar (admin/sales/manager), Topbar
lib/
  supabase/         # client / server / middleware factories + Database types
  landing.ts        # Lógica de la landing pública (registra share_link + redirige)
  demo-data.ts      # Datos placeholder mientras Supabase no está conectado
  utils.ts          # cn, slugify, initials, avatarColor
supabase/
  migrations/       # Esquema, RLS y seed
middleware.ts       # Auth + roles + redirección por rol
_design_package/    # Bundle original de Claude Design (referencia, no se modifica)
```

---

## Próximos pasos (según el plan aprobado)

Estado real por fase actualizado en [`CLAUDE.md` §3](CLAUDE.md). Resumen ultra-corto:

- **Fase 1**: ✅ hecha (schema + RLS + middleware + landing + login).
- **Fase 2 admin**: ⚠️ a medias (`/comerciales` y `/fichas` reales; `/dashboard` con demo-data; `/comerciales/[slug]` y `/resenas/verificacion` placeholders).
- **Fase 3 sales**: ✅ hecha (panel real + clientes con QR + deep-links + plantilla editable).
- **Fase 4 Google sync**: ❌ pendiente (OAuth + cron real + algoritmo de matching).
- **Fase 5 manager**: ❌ pendiente (listado solo-lectura + export Excel).
- **Fase 6 polish**: ❌ pendiente.

Próximo paso recomendado: **Resend SMTP** (destapa el flujo de invite real, ~20 min) → **Fase 4** (es el corazón del producto).

---

## Setup en una máquina nueva

`.env.local` está en `.gitignore` → no viaja entre Macs. En cada máquina hay que regenerarlo. Pasos:

1. `git clone https://github.com/acastillocanton/rese-as-hub.git && cd rese-as-hub`
2. `npm install`
3. Copiar `.env.example` → `.env.local` y rellenar las claves de Supabase desde el [Dashboard](https://supabase.com/dashboard) del proyecto `zejwmznusszqlwhevaqv` → Settings → API:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → la **publishable key** (`sb_publishable_…`).
   - `SUPABASE_SERVICE_ROLE_KEY` → la **secret key** (`sb_secret_…`).
4. `npm run dev` → http://localhost:3000.
5. **Para loguearse mientras no haya SMTP**: usar [`/login/manual`](app/login/manual/page.tsx) con un token generado server-side. Receta en [`CLAUDE.md` §4.1](CLAUDE.md).

⚠️ Las keys de Supabase usan el **nuevo formato** `sb_publishable_*` / `sb_secret_*`. No las JWT antiguas (`eyJhbGc…`).
