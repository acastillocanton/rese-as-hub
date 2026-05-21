# CLAUDE.md

Este archivo lo lee Claude Code automáticamente al abrir el repo. Vive en git → viaja entre Macs → todas las sesiones arrancan con el mismo contexto.

> **Fuente de verdad del producto**: [`spec.md`](spec.md). Si entra en conflicto algo de este archivo con la spec, gana la spec.

---

## 1. Resumen ultra-rápido

**ReseñaHub** — app interna single-tenant para **Inseryal by Marina d'Or**. Sustituye el "parte semanal de reseñas" que Raquel Piquer compila a mano en Excel. Tres roles:

- **admin**: gestor global. Hoy son 2 personas: Alejandro Castillo (`alejandro.castillo@inseryal.es`) y Rafael Ibáñez (`rafael.ibanez@inseryal.es`).
- **sales** (comercial): genera enlaces personalizados por cliente, ve sus reseñas y ranking.
- **reviews_manager** (Raquel Piquer): solo lectura, descarga Excel mensual.

Flujo: comercial comparte `reseñahub.es/c/{slug-comercial}/{slug-cliente}` → cliente cae directo en "Escribir reseña" en Google (302) → cron sincroniza vía Google Business Profile API → algoritmo atribuye la reseña al comercial mediante ventana temporal + nombre del cliente.

Stack: Next.js 15 App Router + Turbopack · TypeScript strict · Supabase (Postgres + Auth + RLS) · Google Business Profile API + OAuth (una credencial por ficha) · Resend (email transaccional, pendiente de conectar) · Vercel hosting + Cron · ExcelJS · qrcode.react · Zod.

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

## 3. Estado del proyecto (snapshot 2026-05-21)

Plan original en `~/.claude/plans/vamos-a-desarrollar-una-kind-lovelace.md`. Resumen real por fase:

### Fase 1 · Foundation — ✅ hecha
- Schema (locations + location_secrets + profiles + clients + share_links + reviews + audit_log) + RLS + helper `current_role()`.
- Middleware con auth + roles + redirección por rol.
- Magic-link login + callback.
- Landing pública `/c/[salesSlug]/[clientSlug]` registra share_link + 302 a Google.
- Modo demo sin `.env`.

### Fase 2 · Admin — ⚠️ a medias
| Pantalla | Estado |
|---|---|
| [`/dashboard`](app/(admin)/dashboard/page.tsx) | UI completa pero **usa `lib/demo-data.ts` hardcodeada** — no enchufada a Supabase |
| [`/comerciales`](app/(admin)/comerciales/page.tsx) | ✅ DB real + invite + delete |
| [`/comerciales/[slug]`](app/(admin)/comerciales/[slug]/page.tsx) | ❌ `ComingSoon` |
| [`/resenas/verificacion`](app/(admin)/resenas/verificacion/page.tsx) | ❌ `ComingSoon` |
| [`/fichas`](app/(admin)/fichas/page.tsx) | ✅ lista + add + delete, **pero falta botón "Conectar OAuth"** |

### Fase 3 · Sales (comercial) — ✅ hecha (validada E2E el 2026-05-21)
- [`/panel`](app/(sales)/panel/page.tsx) con datos reales del comercial logueado (KPIs propios, proyección ETA, enlace personal). Ranking aparcado como `ComingSoon` (requiere migración nueva).
- [`/clientes`](app/(sales)/clientes/page.tsx) entero: lista, alta con server action, dialog con URL + QR + plantilla editable + deep-links WhatsApp/Email/SMS.
- [`lib/messaging.ts`](lib/messaging.ts) con plantilla por defecto + helpers de deep-link.

### Fase 4 · Google sync + matching — ❌ no empezado
**Es el corazón del producto.** Sin esto, los comerciales no ven reseñas en su panel.

A implementar:
1. OAuth con Google Cloud (alta proyecto + activar Business Profile API + credenciales).
2. `/api/google/oauth/callback` + botón "Conectar" en `/fichas`.
3. `lib/google/business-profile.ts` (cliente API).
4. `lib/matching/attribute-review.ts` (algoritmo de matching).
5. Cron real en [`app/api/cron/sync-google-reviews/route.ts`](app/api/cron/sync-google-reviews/route.ts) (hoy es stub).
6. `vercel.json` con el cron cada 10 min.

### Fase 5 · Reviews manager (Raquel) — ❌ no empezado
[`/manager/resenas`](app/(manager)/manager/resenas/page.tsx) y [`/manager/export`](app/(manager)/manager/export/page.tsx) son `ComingSoon`. Endpoint `/api/export/reviews` con ExcelJS por hacer. Tiene sentido **post-Fase 4** (sin reseñas reales, no hay nada que exportar).

### Fase 6 · Polish — ❌
A11y, loading/error states, seed realista, tests Vitest + Playwright.

---

## 4. Workarounds operativos vigentes

Cosas reales del estado actual que hay que saber para no tropezar:

### 4.1 Email rate limit de Supabase (hard cap, 2/hora)
El servicio built-in de Supabase Auth tiene un límite **inamovible de 2 emails/hora por proyecto**. Para invitar comerciales o loguearse vía magic-link más allá de eso, hay que:
- **Fix definitivo (pendiente)**: configurar SMTP custom con Resend en Supabase Dashboard → Authentication → Email Provider.
- **Workaround actual**: pantalla [`/login/manual`](app/login/manual/page.tsx). Genera un token vía `admin.generate_link` server-side y abre `localhost:3000/login/manual?token=<hashed_token>`. El cliente llama a `verifyOtp({ token_hash, type: 'magiclink' })` y entra sin pasar por email ni por PKCE.

Para generar un token manualmente desde la terminal (necesitas `.env.local` con `SUPABASE_SERVICE_ROLE_KEY`):
```bash
set -a && source .env.local && set +a && \
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"<email@inseryal.es>"}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("http://localhost:3000/login/manual?token="+d.get("hashed_token",""))'
```

### 4.2 Invite-link generado por el admin (en `/comerciales`) NO funciona con PKCE
El server action `inviteSales` usa `admin.generateLink({ type: 'invite' })` y devuelve un `action_link` server-side. Al abrirlo en el navegador, llega un `?code=...` a `/auth/callback` pero **no hay code_verifier en cookies** (porque el flow no se inició desde el browser). Resultado: error `"PKCE code verifier not found in storage"`.

Mitigación actual: en su lugar, generar token con `admin.generate_link` + abrir `/login/manual?token=...`.

Fix correcto (pendiente): hacer real la página [`/accept-invite/[token]`](app/accept-invite/[token]/page.tsx) usando `verifyOtp({ token_hash, type: 'invite' })`, y cambiar `inviteSales` para devolver `/accept-invite/<hashed_token>` en vez del `action_link` directo.

### 4.3 `signInWithOtp` debe ir SIEMPRE en el cliente, no en server action
El verifier PKCE se persiste en `document.cookie` cuando lo inicia el cliente browser. Si lo inicias desde una server action, el verifier se queda server-side y el callback rompe. Aprendido el 2026-05-21. [`app/login/LoginForm.tsx`](app/login/LoginForm.tsx) ya hace lo correcto.

### 4.4 El `status` del comercial no se actualiza al primer login
Tras `inviteSales`, el comercial queda con `status='invited'`. Hoy ningún sitio del código lo mueve a `'active'` cuando completa primer acceso. Operativo (no rompe nada) pero queda raro en el listado del admin.

### 4.5 Comerciales sin Resend → solo se pueden invitar con workaround
Hoy solo se puede invitar a un comercial usando `/login/manual` con un token generado server-side. Para que el flujo "admin pulsa botón → comercial recibe email" funcione en condiciones, hay que configurar Resend.

---

## 5. Setup en otro Mac (lo que falta hacer cuando empezamos en una máquina nueva)

`.env.local` está en `.gitignore` — no viaja entre máquinas. En cada Mac hay que regenerarlo. Pasos:

1. `git clone https://github.com/acastillocanton/rese-as-hub.git`
2. `cd rese-as-hub && npm install`
3. Crear `.env.local` desde `.env.example`. Necesitas:
   - `NEXT_PUBLIC_SUPABASE_URL` → `https://zejwmznusszqlwhevaqv.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → publishable key (`sb_publishable_...`) desde Supabase Dashboard → Settings → API.
   - `SUPABASE_SERVICE_ROLE_KEY` → secret key (`sb_secret_...`), misma pantalla, en "Secret keys".
   - `CRON_SECRET` → generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
4. `npm run dev` → http://localhost:3000.
5. Para loguearse: usar `/login/manual?token=...` con token generado vía la receta de §4.1, **mientras no esté configurado Resend SMTP**.

⚠️ **Las keys de Supabase usan el nuevo formato** `sb_publishable_*` / `sb_secret_*`. Las JWT antiguas (`eyJhbGc…`) **siguen** funcionando si existen, pero el proyecto usa las nuevas.

---

## 6. Reglas críticas (de spec.md §7)

### Always do
- Validar inputs externos en el límite del sistema (Zod en server actions, `isValidSlug`/`isSafeNext` en route handlers).
- Parametrizar consultas vía Supabase query builder.
- Aplicar RLS en toda tabla con datos sensibles. `location_secrets` tiene RLS sin políticas — solo service-role.
- Usar `createServiceClient` **solo** desde código server-only (cron, landing pública, server actions internas). **Nunca** importarlo desde un componente cliente.
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

---

## 7. Estado real de Supabase (snapshot 2026-05-21)

- **Proyecto**: `zejwmznusszqlwhevaqv.supabase.co`. Migraciones 001+002 aplicadas.
- **2 admins**: Alejandro Castillo + Rafael Ibáñez (ambos `@inseryal.es`).
- **1 comercial de prueba**: "Comercial prueba" / `comercial-prueba` / asignado a "Inseryal by Marina d'Or · Chamberí" / status `invited`. Email: `a.castillo.esv@gmail.com`.
- **1 cliente de prueba**: "Otto Castillo" / `otto-castillo` (creado por "Comercial prueba").
- **7 fichas** dadas de alta — 5 "Inseryal by Marina d'Or" (Oropesa + Madrid Pardiñas + Madrid Príncipe de Vergara + Leganés + Chamberí) y 2 "Marina d'Or Construcciones" (Castellón + Valencia). Solo la de Chamberí tiene `google_place_id` (`ChIJu9sQJr8pQg0RVMjg-UM8zYI`). Todas con `oauth_status: disconnected` — Fase 4 pendiente.
- **2 share_links** registradas (las dos primeras pruebas E2E del 2026-05-21). 0 reseñas.

Antes de actuar sobre cualquier dato, verifica con `curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/<tabla>?select=... -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`. La BD evoluciona; este snapshot envejece.

---

## 8. Próximo paso recomendado

En orden de impacto:

1. **Configurar Resend SMTP** (~20-30 min). Sin esto, el flujo de invite real no funciona y dependemos de `/login/manual` en cada sesión nueva.
2. **Fase 4 — Google sync + matching** (~1-2 sesiones). Es lo que cierra el ciclo de valor del MVP: los comerciales empiezan a ver sus reseñas.
3. **Cerrar Fase 2 admin** (~1 sesión). Tiene más sentido **post-Fase 4** porque la bandeja de verificación está vacía hasta que entren reseñas reales.

---

## 9. Cómo mantener este archivo

Cada vez que termine una tanda significativa de trabajo:
1. Actualizar §3 (estado por fase) con lo que se ha hecho.
2. Si surge un workaround nuevo, añadir entrada a §4.
3. Si la BD cambia (nuevos users, fichas, etc.), actualizar §7.
4. Si se cierran open questions de la spec, marcarlas en `spec.md` §9.
5. Commit con mensaje descriptivo + push.

Los `MEMORY.md` que veas dentro de `~/.claude/projects/...` son **locales a cada Mac** — no se versionan. Lo importante para la continuidad es este `CLAUDE.md` y la `spec.md`.
