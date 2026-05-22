# CLAUDE.md

Este archivo lo lee Claude Code automáticamente al abrir el repo. Vive en git → viaja entre Macs → todas las sesiones arrancan con el mismo contexto.

> **Fuente de verdad del producto**: [`spec.md`](spec.md). Si entra en conflicto algo de aquí con la spec, gana la spec.

---

## 1. Resumen

**ReseñaHub** — app interna single-tenant para **Inseryal by Marina d'Or**. Sustituye el parte semanal de reseñas que Raquel Piquer compila a mano en Excel.

Tres roles:
- **admin** — gestor global. Hoy 2 personas: Alejandro Castillo + Rafael Ibáñez (`@inseryal.es`).
- **sales** (comercial) — genera enlaces personalizados por cliente, ve sus reseñas, su ranking.
- **reviews_manager** (Raquel + Bel) — comparte vista con admin en Dashboard y comerciales, **con plenos permisos de administración sobre el rol sales** (invitar / editar / reenviar acceso / eliminar). Adicional: `/manager/resenas` y `/manager/export`. NO accede a `/gestores`, `/fichas`, `/resenas/verificacion`, `/ajustes`.

**Flujo**: comercial comparte `resenas.marinadorconstrucciones.com/c/{sales-slug}/{client-slug}` → cliente cae directo en "Escribir reseña" en Google (302) → cron sincroniza vía Google Business Profile API → algoritmo atribuye al comercial por ventana temporal + nombre del cliente.

**Stack**: Next.js 15.5.18 App Router + Turbopack · TypeScript strict · Supabase (Postgres + Auth + RLS) · Google Business Profile API + OAuth (una credencial por ficha) · Brevo SMTP (vía Supabase para magic-links/invites; vía Nodemailer en [lib/email/brevo.ts](lib/email/brevo.ts) para notificaciones transaccionales — claves SMTP independientes) · Vercel Hobby + cron diario `0 9 * * *` UTC · ExcelJS · qrcode.react · Zod · lucide-react.

**Producción**: [`https://resenas.marinadorconstrucciones.com`](https://resenas.marinadorconstrucciones.com). DNS en SiteGround.

---

## 2. Comandos

```bash
npm install            # primera vez en una máquina nueva
npm run dev            # dev en http://localhost:3000 (Turbopack)
npm run build          # build producción (verifica tipos)
npm run typecheck      # tsc --noEmit — pasar antes de cerrar tarea
npm run lint           # next lint
```

Migraciones SQL: ejecutar en Supabase Dashboard → SQL Editor en orden numérico (`001_*`, `002_*`, …). Las migraciones son `Ask first` (ver §6).

---

## 3. Estado del proyecto

> Producto live y validado E2E en producción. Único bloqueo activo: **aprobación de la cuota de Google Business Profile API** (caso `5-5855000041022`, ETA ~2026-06-04). Sin cuota, el cron no trae reseñas reales; el resto de la app es funcional.

| Fase | Estado |
|---|---|
| 1 · Foundation (schema + RLS + auth + landing pública `/c/...`) | ✅ |
| 2 · Admin (`/dashboard`, `/comerciales`, `/gestores`, `/fichas`, `/resenas/verificacion`) | ✅ |
| 3 · Sales desktop (`/panel`, `/panel/enlace`, `/panel/resenas`, `/clientes`, `/clientes/[slug]`) | ✅ |
| 3.b · Sales mobile (ver subsección) | ✅ |
| 4 · Google sync + matching | ⚠️ código listo, esperando cuota |
| 5 · Reviews manager (`/manager/resenas`, `/manager/export`) | ✅ |
| 6 · Polish | ⚠️ parcial — falta a11y, loading states, tests, seed |
| 7 · Deploy producción | ✅ |
| Perfil global (`/perfil` + avatares) | ✅ |
| Páginas legales (`/privacidad`, `/terminos`) | ✅ |

### Vista mobile del comercial (Fase 3.b)
Solo el rol sales tiene vista mobile (`≤767px`). Admin/gestor/profile siguen desktop-only por diseño (oficina). Implementado con **CSS media queries puras** (sin hooks JS, sin route group duplicado, sin flicker SSR) con clases prefijadas `sales-*` al final de [`app/globals.css`](app/globals.css).

Chrome mobile:
- Sidebar 232px oculto via `.sales-hide-mobile`.
- [`<MobileTabBar />`](components/layout/MobileTabBar.tsx) fija inferior con 4 tabs (Panel · Enlace · Reseñas · Ranking), iconos lucide, `padding-bottom: env(safe-area-inset-bottom)`. Reusa [`pickActiveId`](components/layout/active-item.ts) compartido con `Sidebar`.
- "Clientes" no está en la tab bar (fidelidad al mockup). Se accede desde card mobile-only "Mis clientes" en `/panel`.
- [`/panel/ranking`](app/(sales)/panel/ranking/page.tsx) = ComingSoon hasta que se implemente.

Clases mobile (todas `!important` para vencer al inline `style={{}}` desktop): `sales-hide-mobile` / `sales-hide-desktop` / `sales-mobile-only`, `sales-page-pad`, `sales-grid-hero` / `sales-stats-3` / `sales-stats-4` / `sales-qr-grid` / `sales-detail-grid`, `sales-ring-row`, `sales-review-row` + `sales-review-pill`, `sales-rangepicker-popover`, `sales-topbar-compact` (activada con prop `compact` de `Topbar`).

`ClientRowItem` mantiene dos sub-layouts coexistentes (desktop grid 5 cols + mobile card vertical) compartiendo estado.

### Fase 4 · Google (detalle)
Código completo en [`lib/google/business-profile.ts`](lib/google/business-profile.ts) (cliente OAuth + reviews v4 con `fetchWithRetry` para 429/5xx), [`lib/matching/attribute-review.ts`](lib/matching/attribute-review.ts) (ventana 48h + similitud Unicode-aware; thresholds 75/40), [`/api/cron/sync-google-reviews`](app/api/cron/sync-google-reviews/route.ts) (paginación + early-exit + idempotencia por `unique (location_id, google_review_id)`), [`/api/google/oauth/*`](app/api/google/oauth/) (consent + token swap + state CSRF), [`/fichas/[id]/conectar`](app/(admin)/fichas/[id]/conectar/page.tsx) (UI selección). Email transaccional al comercial cuando entra `counted` en [`lib/email/notify-new-review.ts`](lib/email/notify-new-review.ts) con `escapeHtml` aplicado a todo input externo.

OAuth flow validado E2E. Único pendiente: cuota Google. Mientras tanto las APIs `mybusiness*` devuelven 429 RESOURCE_EXHAUSTED.

### Fase 5 · Gestor (detalle)
Decisión: el gestor unifica vista con admin en lugar de un universo paralelo `/manager/*`. Comparte `/dashboard` y `/comerciales/*` con plenos permisos sobre sales. Pantallas propias: [`/manager/resenas`](app/(manager)/manager/resenas/page.tsx) y [`/manager/export`](app/(manager)/manager/export/page.tsx) (.xlsx con detalle + resumen dashboard). Gating: helper [`assertCanManageSales()`](app/(admin)/comerciales/actions.ts) en las 4 acciones de comerciales. RLS: migración [`005_manager_sales_admin.sql`](supabase/migrations/005_manager_sales_admin.sql) — `with check` impide escalar un sales a admin/manager.

### Pendiente Fase 6 (Polish)
A11y, loading states, seed realista, tests Vitest + Playwright, `noUncheckedIndexedAccess` en tsconfig, política INSERT en `audit_log` (hoy parcheado vía service-client en [`recordAudit()`](lib/audit.ts)).

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
La tabla tiene RLS habilitada sin política de INSERT — diseño: el usuario no fabrica entradas de auditoría. Insert desde cookie-context falla silenciosamente. Usar [`recordAudit()`](lib/audit.ts) en código server-only (bypasea RLS).

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
Vercel Hobby rechaza schedules sub-diarios. [`vercel.json`](vercel.json) tiene `0 9 * * *` (09:00 UTC). Trade-off: reseñas con delay máx 24h en lugar de 10 min. Alternativas si urge inmediatez:
- Botón "Run" manual en Vercel Cron Jobs UI.
- Cron externo (cron-job.org, GitHub Actions) que llame al endpoint con `Authorization: Bearer <CRON_SECRET>`.
- Upgrade a Pro (~$20/mes).

### 4.12 Brevo — dejar IP whitelist desactivada
Settings → Seguridad → IP autorizadas → toggle "Claves SMTP" debe estar **OFF**. Vercel corre en IPs dinámicas de AWS, no podemos whitelistear de antemano. Si se activa, los envíos fallan con `525 5.7.1 Unauthorized IP address`. La autenticación con `BREVO_SMTP_PASS` ya garantiza la seguridad.

### 4.13 Brevo — dos SMTP keys conviven sin pisarse
- `resenahub-supabase` (2026-05-21) — la consume Supabase Auth para magic-links + invites. Configurada en Supabase Dashboard → Auth → SMTP Settings. **NO TOCAR**.
- `resenahub-app` (2026-05-22) — la consume nuestro código en [`lib/email/brevo.ts`](lib/email/brevo.ts) para emails transaccionales. En `BREVO_SMTP_PASS`.

Ambas comparten login (`7e1a24001@smtp-brevo.com`) y remitente (`info@marinadorconstrucciones.com`). Brevo solo enseña el valor al crear la key — si se pierde, regenerar y actualizar `.env.local` + Vercel + redeploy.

### 4.14 Clases `sales-*` solo dentro del scope sales
Las clases con prefijo `sales-*` en [`app/globals.css`](app/globals.css) usan `!important` para vencer al inline `style={{}}`. Eso permite mobile sin tocar desktop, pero contaminarían admin/manager/profile si se aplicaran fuera. Usar **solo** dentro de `app/(sales)/` o de [`MobileTabBar.tsx`](components/layout/MobileTabBar.tsx).

Excepciones controladas:
- [`Topbar.tsx`](components/layout/Topbar.tsx) acepta prop `compact?: boolean` que pinta clases `sales-topbar-*`. Default `false`; solo páginas sales la pasan.
- [`RangePicker.tsx`](components/ui/RangePicker.tsx) lleva siempre `sales-rangepicker-popover`. En desktop no hace nada; en mobile evita que el popover de 320px desborde.

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
   - Opcionales (integración Google): `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI`.
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
- `npm run typecheck` antes de cerrar tarea.
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

---

## 7. Estado real de Supabase

- **Proyecto**: `zejwmznusszqlwhevaqv.supabase.co`. Migraciones 001-006 aplicadas. Próxima (007) será para el ranking (pendiente de diseño).
- **URL Configuration**: Site URL = `https://resenas.marinadorconstrucciones.com`; Redirect URLs incluyen `http://localhost:3000/**` + URL prod con `/**`.
- **Email Templates**: Magic Link con `type=email`, Invite con `type=invite` (ver §4.1).
- **Storage**: bucket público `avatars` con 3 policies (insert/update/delete propio en `{user_id}/`). Avatar upload vía server action con service-role en [`(profile)/perfil/actions.ts`](app/(profile)/perfil/actions.ts) (bypasea RLS por simplicidad).
- **Usuarios**:
  - 2 admins: Alejandro Castillo + Rafael Ibáñez (`@inseryal.es`).
  - 1 comercial prueba: "Comercial prueba" / `comercial-prueba` / "Inseryal by Marina d'Or · Chamberí" / `a.castillo.esv@gmail.com`.
  - 2 gestores activos: Bel (`bel.bernete@inseryal.es`, real) + "Gestor Ale" (`elalecu@gmail.com`, pruebas).
  - 1 cliente prueba: "Otto Castillo" / `otto-castillo`.
- **7 fichas**: 5 Inseryal (Oropesa, Pardiñas, Príncipe de Vergara, Leganés, Chamberí) + 2 Marina d'Or Construcciones (Castellón, Valencia). Solo Chamberí tiene `google_place_id`. Todas `oauth_status: disconnected` (esperando cuota Google).

Antes de actuar sobre datos verificar con `curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/<tabla>?select=... -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`. La BD evoluciona.

---

## 8. Próximo paso

1. **Esperar aprobación Google** (caso `5-5855000041022`, ETA ~2026-06-04). Sin cuota, las APIs `mybusiness*` devuelven 429 y el cron no trae reseñas — el resto de la app es funcional.
2. **Cuando Google apruebe**: probar OAuth E2E (`listAccounts` / `listLocations` / `listReviews`). Si va bien, conectar las 7 fichas desde `/fichas` en prod. El redirect URI de prod ya está añadido en Google Cloud Console.
3. **Publicar consent screen fuera de Testing** (Verification de Google) si en el futuro hay testers externos al equipo interno actual.
4. **Polish opcional**: a11y, loading states, seed más realista, tests Vitest + Playwright, `noUncheckedIndexedAccess`, política INSERT en `audit_log`.
5. **Ranking del comercial**: migración 007 + UI real para `/panel/ranking` (hoy ComingSoon).

---

## 9. Mantenimiento

Cada vez que termine una tanda significativa:
1. Actualizar §3 con lo nuevo (no añadir prosa: usar bullets cortos).
2. Si surge un workaround nuevo, entrada en §4.
3. Si la BD cambia (usuarios, fichas, migraciones), actualizar §7.
4. Si se cierran open questions de la spec, marcarlas en `spec.md`.
5. Commit + push.

Los `MEMORY.md` de `~/.claude/projects/...` son **locales a cada Mac**, no se versionan. La continuidad cross-Mac es este `CLAUDE.md` + `spec.md`.
