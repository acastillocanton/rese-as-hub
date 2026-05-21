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
| [`/comerciales`](app/(admin)/comerciales/page.tsx) | ✅ DB real + invite + delete + fila navegable |
| [`/comerciales/[slug]`](app/(admin)/comerciales/[slug]/page.tsx) | ✅ ficha completa: datos editables (meta/ficha/status), KPIs (reseñas mes + visitas + clientes), lista de clientes con visitas y reseñas, sección reseñas con placeholder hasta Fase 4 |
| [`/resenas/verificacion`](app/(admin)/resenas/verificacion/page.tsx) | ❌ `ComingSoon` |
| [`/fichas`](app/(admin)/fichas/page.tsx) | ✅ lista + add + delete + botones Conectar/Desconectar Google + UI selección de Business Profile en `/fichas/[id]/conectar` |

### Fase 3 · Sales (comercial) — ✅ hecha (validada E2E el 2026-05-21)
- [`/panel`](app/(sales)/panel/page.tsx) con datos reales del comercial logueado (KPIs propios, proyección ETA, enlace personal). Ranking aparcado como `ComingSoon` (requiere migración nueva).
- [`/clientes`](app/(sales)/clientes/page.tsx) entero: lista, alta con server action, dialog con URL + QR + plantilla editable + deep-links WhatsApp/Email/SMS. Fila navegable a detalle.
- [`/clientes/[slug]`](app/(sales)/clientes/[slug]/page.tsx) detalle del cliente: datos, KPIs de visitas al enlace, bloque compartir reusado ([`ShareBlock`](app/(sales)/clientes/ShareBlock.tsx)), placeholder de reseñas atribuidas (mostrará lista real cuando entre Fase 4), botón eliminar con confirmación.
- [`lib/messaging.ts`](lib/messaging.ts) con plantilla por defecto + helpers de deep-link.

### Fase 4 · Google sync + matching — ⚠️ código listo, esperando aprobación de Google
**Es el corazón del producto.** Código entero implementado y OAuth validado E2E. Único bloqueo: la cuota de la API está a 0 hasta que Google apruebe la solicitud (caso `5-5855000041022`, ETA ~2026-06-04).

Hecho:
1. [`lib/google/business-profile.ts`](lib/google/business-profile.ts) — cliente API con refresh-token automático. Cubre OAuth, Account Management, Business Information y Reviews (v4 legacy).
2. [`/api/google/oauth/start`](app/api/google/oauth/start/route.ts) — inicia consent con state CSRF en cookie.
3. [`/api/google/oauth/callback`](app/api/google/oauth/callback/route.ts) — token swap, persiste en `location_secrets`, redirige a `/fichas/[id]/conectar`.
4. [`/fichas/[id]/conectar`](app/(admin)/fichas/[id]/conectar/page.tsx) — UI que lista las cuentas + fichas de Google y deja al admin elegir cuál vincular. Pre-selecciona la que coincide por `google_place_id`.
5. [`/fichas`](app/(admin)/fichas/page.tsx) — añadidos botones "Conectar Google" / "Desconectar" + banner de éxito/error + columna "Cuenta Google" con el email.
6. [`lib/matching/attribute-review.ts`](lib/matching/attribute-review.ts) — algoritmo de atribución con ventana temporal (48h) + similitud de nombre. Thresholds: `AUTO_THRESHOLD=75` → counted, 40-75 → pending para verificación admin, <40 → unmatched.
7. [`/api/cron/sync-google-reviews`](app/api/cron/sync-google-reviews/route.ts) — implementación real (no stub). Idempotente vía `unique (location_id, google_review_id)`. Devuelve summary JSON por ficha.
8. [`vercel.json`](vercel.json) — schedule `*/10 * * * *`.

Pendiente:
- ✅ Migración 004 aplicada en Supabase (2026-05-21).
- ✅ Google Cloud: proyecto `628454280082`, APIs habilitadas, credenciales OAuth Web App con redirect URI `http://localhost:3000/api/google/oauth/callback`, consent screen en Testing con `socialmedia.inseryal@gmail.com` como test user + scopes `openid`, `email`, `business.manage`.
- ✅ `.env.local` con `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
- ✅ OAuth flow validado E2E (token swap + userinfo).
- ⏳ **Quota a 0 hasta que Google apruebe acceso a la API**. Solicitud enviada el 2026-05-21, **case ID `5-5855000041022`**. ETA 7-10 días hábiles (∼2026-06-04). Sin esto las APIs `mybusiness*` devuelven 429 RESOURCE_EXHAUSTED y la página `/fichas/[id]/conectar` no puede listar cuentas. Cuando Google responda, todo lo demás funciona sin tocar código.

### Fase 5 · Reviews manager (Raquel) — ✅ hecha (esperando reseñas reales para validar E2E)
- [`/manager/comerciales`](app/(manager)/manager/comerciales/page.tsx) — tabla read-only con KPIs del mes por comercial. Cada fila navega al detalle.
- [`/manager/comerciales/[slug]`](app/(manager)/manager/comerciales/[slug]/page.tsx) — ficha read-only del comercial (mismo render que admin sin botones de edición/eliminación).
- [`/manager/resenas`](app/(manager)/manager/resenas/page.tsx) — listado global de reseñas con filtros (mes, comercial, ficha, match_state) + MiniStats de resumen.
- [`/manager/export`](app/(manager)/manager/export/page.tsx) — atajos mensuales + formulario personalizado.
- [`/api/export/reviews`](app/api/export/reviews/route.ts) — devuelve .xlsx con ExcelJS. Dos hojas: Reseñas (una fila por reseña con todo el detalle) + Resumen (ranking comerciales + ranking fichas + totales).
- Sidebar manager: items Comerciales / Reseñas / Exportar Excel.

### Fase 6 · Polish — ❌
A11y, loading/error states, seed realista, tests Vitest + Playwright.

---

## 4. Workarounds operativos vigentes

Cosas reales del estado actual que hay que saber para no tropezar:

### 4.1 Auth por email — flujo OTP `token_hash` (no PKCE)
Brevo SMTP está configurado en Supabase Auth. El flujo de login/invite **NO usa PKCE** — usa el patrón OTP `token_hash` recomendado por Supabase para SSR (`@supabase/ssr`). Razón: PKCE exige un `code_verifier` en cookies del browser que inició la sesión, y rompía cuando el comercial abría el link desde otro dispositivo o cuando el invite-link se generaba server-side.

Cómo funciona:
1. Login: [`app/login/LoginForm.tsx`](app/login/LoginForm.tsx) llama `signInWithOtp({ email, options: { emailRedirectTo } })` desde el cliente. Supabase envía email vía Brevo.
2. El email lleva al usuario a `${SITE_URL}/auth/confirm?token_hash=<hash>&type=magiclink&next=<path>`.
3. [`app/auth/confirm/route.ts`](app/auth/confirm/route.ts) verifica server-side con `verifyOtp({ token_hash, type })`, mete la sesión en cookies vía `@supabase/ssr` y redirige a `next`.

**Plantilla email en Supabase Dashboard** (Authentication → Email Templates) — IMPORTANTE, **hay que cambiarla manualmente**:
- **Magic Link**: href = `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=%2F`
- **Invite user**: href = `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=%2Fpanel`
- Verificar también que `Site URL` y `Redirect URLs` en Authentication → URL Configuration incluyen `http://localhost:3000` (dev) y la URL de prod.

### 4.2 Rate limit Supabase Auth — ya mitigado vía Brevo
El built-in tenía un cap de 2 emails/hora. Con Brevo SMTP configurado ya no es el cuello de botella.

Workaround manual aún disponible (debug / si Brevo cae): [`/login/manual?token=<hashed_token>`](app/login/manual/page.tsx) — redirige internamente a `/auth/confirm`. Para generar token desde terminal:
```bash
set -a && source .env.local && set +a && \
curl -sS -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"<email@inseryal.es>"}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("http://localhost:3000/login/manual?token="+d.get("hashed_token",""))'
```

### 4.3 `signInWithOtp` debe ir SIEMPRE en el cliente, no en server action
[`app/login/LoginForm.tsx`](app/login/LoginForm.tsx) lo llama desde el browser. Razón histórica: con PKCE el verifier tenía que vivir en `document.cookie`. Con el flujo `token_hash` ya no aplica esa restricción, pero mantenerlo en el cliente preserva la UX (estado de envío, error inline, etc.).

### 4.4 Status del comercial — auto-flip a `active` al primer login
[`app/auth/confirm/route.ts`](app/auth/confirm/route.ts) hace un `UPDATE profiles SET status='active' WHERE id=user.id AND status='invited'` tras un `verifyOtp` exitoso. Esto cubre tanto magic-link como invite. `paused` se respeta (no se sobreescribe). El admin sigue pudiendo forzar el estado desde la ficha del comercial.

### 4.5 Hydration warning silenciado en `<html>`
[`app/layout.tsx`](app/layout.tsx) usa `suppressHydrationWarning` en `<html>` porque alguna extensión del navegador (Dark Reader-style) inyecta `className="light"` antes de que React hidrate. No afecta lógica, solo silencia el warning del dev overlay.

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
5. Para loguearse: con Brevo configurado, basta con ir a `/login` y pedir un magic link. Si Brevo falla, fallback es `/login/manual?token=...` (receta en §4.2).

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

- **Proyecto**: `zejwmznusszqlwhevaqv.supabase.co`. Migraciones 001+002+004 aplicadas.
- **2 admins**: Alejandro Castillo + Rafael Ibáñez (ambos `@inseryal.es`).
- **1 comercial de prueba**: "Comercial prueba" / `comercial-prueba` / asignado a "Inseryal by Marina d'Or · Chamberí" / status `active` (auto-flipped al primer login). Email: `a.castillo.esv@gmail.com`.
- **1 cliente de prueba**: "Otto Castillo" / `otto-castillo` (creado por "Comercial prueba").
- **7 fichas** dadas de alta — 5 "Inseryal by Marina d'Or" (Oropesa + Madrid Pardiñas + Madrid Príncipe de Vergara + Leganés + Chamberí) y 2 "Marina d'Or Construcciones" (Castellón + Valencia). Solo la de Chamberí tiene `google_place_id` (`ChIJu9sQJr8pQg0RVMjg-UM8zYI`). Todas con `oauth_status: disconnected` — esperando aprobación de Google para conectar.
- **2 share_links** registradas (las dos primeras pruebas E2E del 2026-05-21). 0 reseñas.

Antes de actuar sobre cualquier dato, verifica con `curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/<tabla>?select=... -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`. La BD evoluciona; este snapshot envejece.

---

## 8. Próximo paso recomendado

Mientras Google aprueba el caso `5-5855000041022` (ETA ~2026-06-04):

1. **Edición inline en `/clientes/[slug]`** (~20 min). Hoy el comercial solo puede crear y eliminar; falta corregir email/teléfono sin tener que borrar.

Post-aprobación Google:

2. **Probar OAuth flow E2E con datos reales** — el código está validado hasta el token swap; falta `listAccounts`/`listLocations`/`listReviews`.
3. **`/resenas/verificacion` admin** — bandeja para reseñas con `match_state='pending'` (confianza 40-75) donde el admin reasigna o confirma.
4. **Notificación Resend al comercial** cuando entre una reseña con match='counted'.

Polish (Fase 6):

5. A11y, loading/error states, seed más realista, tests Vitest + Playwright.

---

## 9. Cómo mantener este archivo

Cada vez que termine una tanda significativa de trabajo:
1. Actualizar §3 (estado por fase) con lo que se ha hecho.
2. Si surge un workaround nuevo, añadir entrada a §4.
3. Si la BD cambia (nuevos users, fichas, etc.), actualizar §7.
4. Si se cierran open questions de la spec, marcarlas en `spec.md` §9.
5. Commit con mensaje descriptivo + push.

Los `MEMORY.md` que veas dentro de `~/.claude/projects/...` son **locales a cada Mac** — no se versionan. Lo importante para la continuidad es este `CLAUDE.md` y la `spec.md`.
