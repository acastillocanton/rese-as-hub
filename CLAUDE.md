# CLAUDE.md

Este archivo lo lee Claude Code automáticamente al abrir el repo. Vive en git → viaja entre Macs → todas las sesiones arrancan con el mismo contexto.

> **Fuente de verdad del producto**: [`spec.md`](spec.md). Si entra en conflicto algo de este archivo con la spec, gana la spec.

---

## 1. Resumen ultra-rápido

**ReseñaHub** — app interna single-tenant para **Inseryal by Marina d'Or**. Sustituye el "parte semanal de reseñas" que Raquel Piquer compila a mano en Excel. Tres roles:

- **admin**: gestor global. Hoy son 2 personas: Alejandro Castillo (`alejandro.castillo@inseryal.es`) y Rafael Ibáñez (`rafael.ibanez@inseryal.es`).
- **sales** (comercial): genera enlaces personalizados por cliente, ve sus reseñas y ranking.
- **reviews_manager** (Raquel Piquer): solo lectura, ve el mismo Dashboard global que el admin + lista de comerciales (sin editar) + lista global de reseñas + descarga Excel.

Flujo: comercial comparte `reseñahub.es/c/{slug-comercial}/{slug-cliente}` → cliente cae directo en "Escribir reseña" en Google (302) → cron sincroniza vía Google Business Profile API → algoritmo atribuye la reseña al comercial mediante ventana temporal + nombre del cliente.

Stack: Next.js 15.5.18 App Router + Turbopack · TypeScript strict · Supabase (Postgres + Auth + RLS) · Google Business Profile API + OAuth (una credencial por ficha) · Brevo SMTP (magic-link de auth, vía Supabase) · Resend (notificaciones transaccionales al comercial, integrado en el cron — habilítalo poniendo `RESEND_API_KEY`) · Vercel hosting + Cron · ExcelJS · qrcode.react · Zod · lucide-react (iconos).

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
| [`/comerciales`](app/(admin)/comerciales/page.tsx) | ✅ DB real + invite + reenviar acceso + delete + fila navegable. Sin acciones admin si el viewer es manager (`canEdit` gateado por rol). |
| [`/comerciales/[slug]`](app/(admin)/comerciales/[slug]/page.tsx) | ✅ **Mini-dashboard del comercial** con RangePicker + botón "Descargar Excel" individual. KPIs por rango (visitas / atribuidas / conversión / valoración media). Para admin: `SalesEditCard` editable; para manager: `SalesReadOnlyCard`. |
| [`/gestores`](app/(admin)/gestores/page.tsx) | ✅ Página propia (separada de comerciales). Lista + invite + reenviar + delete. Modelo: un gestor (Raquel) pero soporta varios. |
| [`/resenas/verificacion`](app/(admin)/resenas/verificacion/page.tsx) | ✅ bandeja de reseñas `pending`/`unmatched`. Acciones confirmar / rechazar / reasignar. Auditoría en `audit_log` por cada acción (vía `recordAudit()` con service-client — ver §4.6). |
| [`/fichas`](app/(admin)/fichas/page.tsx) | ✅ lista + add + delete + Conectar/Desconectar Google + UI selección de Business Profile en `/fichas/[id]/conectar`. |

### Fase 3 · Sales (comercial) — ✅ hecha (validada E2E el 2026-05-21)
- [`/panel`](app/(sales)/panel/page.tsx) con datos reales del comercial logueado (KPIs propios, proyección ETA, enlace personal). Ranking aparcado como `ComingSoon` (requiere migración nueva).
- [`/clientes`](app/(sales)/clientes/page.tsx) entero: lista, alta con server action, dialog con URL + QR + plantilla editable + deep-links WhatsApp/Email/SMS. Fila navegable a detalle.
- [`/clientes/[slug]`](app/(sales)/clientes/[slug]/page.tsx) detalle del cliente: datos editables inline vía [`ClientEditCard`](app/(sales)/clientes/[slug]/ClientEditCard.tsx), KPIs de visitas, bloque compartir reusado, placeholder reseñas (lista real cuando entre Fase 4), botón eliminar.
- [`lib/messaging.ts`](lib/messaging.ts) con plantilla por defecto + helpers de deep-link.

### Fase 4 · Google sync + matching — ⚠️ código listo, esperando aprobación de Google
**Es el corazón del producto.** Código entero implementado y OAuth validado E2E. Único bloqueo: la cuota de la API está a 0 hasta que Google apruebe la solicitud (caso `5-5855000041022`, ETA ~2026-06-04).

Hecho:
1. [`lib/google/business-profile.ts`](lib/google/business-profile.ts) — cliente API con refresh-token automático + **`fetchWithRetry()` con backoff exponencial + Retry-After** para 429/5xx. Cubre OAuth, Account Management, Business Information y Reviews (v4 legacy).
2. [`/api/google/oauth/start`](app/api/google/oauth/start/route.ts) — inicia consent con state CSRF en cookie httpOnly+Secure+SameSite=lax.
3. [`/api/google/oauth/callback`](app/api/google/oauth/callback/route.ts) — token swap, persiste en `location_secrets`, redirige a `/fichas/[id]/conectar`.
4. [`/fichas/[id]/conectar`](app/(admin)/fichas/[id]/conectar/page.tsx) — UI que lista las cuentas + fichas de Google. Pre-selecciona la que coincide por `google_place_id`.
5. [`lib/matching/attribute-review.ts`](lib/matching/attribute-review.ts) — algoritmo con ventana temporal (`TEMPORAL_WINDOW_HOURS=48`) + similitud Unicode-aware. Thresholds: `AUTO_THRESHOLD=75` → counted, 40-75 → pending, <40 → unmatched.
6. [`/api/cron/sync-google-reviews`](app/api/cron/sync-google-reviews/route.ts) — **paginación con nextPageToken** (MAX_PAGES=10) + early-exit cuando la página ya está sincronizada. Idempotente vía `unique (location_id, google_review_id)`. Si Resend falla al notificar, registra `notify_failed` en `audit_log` con el review_id para reconciliar.
7. [`vercel.json`](vercel.json) — schedule `*/10 * * * *`. Protegido por `CRON_SECRET` con `timingSafeEqual`.
8. [`lib/email/notify-new-review.ts`](lib/email/notify-new-review.ts) + [`lib/email/resend.ts`](lib/email/resend.ts) — email al comercial activo cuando entra reseña `counted`. **Todas las cadenas externas se escapan con `escapeHtml`** (authorName, clientFullName, locationName, preheader, firstName). Degrada gracefully si `RESEND_API_KEY` no está set.

Pendiente:
- ✅ Migración 004 aplicada en Supabase (2026-05-21).
- ✅ Google Cloud configurado: proyecto `628454280082`, OAuth Web App, consent screen en Testing.
- ✅ `.env.local` con `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
- ✅ OAuth flow validado E2E (token swap + userinfo).
- ⏳ **Quota a 0 hasta que Google apruebe acceso a la API**. Solicitud enviada 2026-05-21, **case ID `5-5855000041022`**. ETA ~2026-06-04. Sin esto las APIs `mybusiness*` devuelven 429 RESOURCE_EXHAUSTED.

### Fase 5 · Reviews manager (Raquel) — ✅ hecha (esperando reseñas reales)
**Decisión de diseño 2026-05-21**: el gestor unifica con admin en lugar de tener un universo paralelo `/manager/*`. Comparte `/dashboard` y `/comerciales/*` con el admin, con las acciones de edición ocultas vía `canEdit`. Las pantallas viejas `/manager/comerciales` y `/manager/comerciales/[slug]` fueron eliminadas.

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

### Fase 6 · Polish — ⚠️ parcial
Hecho (auditoría técnica del 2026-05-21):
- `error.tsx` por grupo (`(admin)`, `(sales)`, `(manager)`) + `global-error.tsx` raíz con componente reusable [`ErrorState`](components/layout/ErrorState.tsx).
- Cron Google: paginación + early-exit + retry/backoff cliente + audit_log de fallos de email.
- Email transaccional: escape HTML completo.
- `audit_log` operativo (antes los inserts vía cookie-context fallaban silenciosamente; ahora pasan por [`recordAudit()`](lib/audit.ts) con service-client).
- Indexación bloqueada: [`robots.txt`](app/robots.ts) Disallow:/ + `metadata.robots` noindex/nofollow en layout raíz.
- Bump Next.js 15.1.0 → 15.5.18 (cubrió 14 advisories incluida 1 critical de Authorization Bypass en Middleware).
- Sidebar agrupado por dominio + iconos lucide-react (ver §3 cualquier pantalla).
- RangePicker funcional reusable ([`components/ui/RangePicker.tsx`](components/ui/RangePicker.tsx)) reemplazando al `<DateRange>` decorativo.
- Botón "Reenviar acceso" en comerciales y gestores ([`components/ui/ResendAccessButton.tsx`](components/ui/ResendAccessButton.tsx)) — genera magic-link fresco vía service-client sin tener que eliminar y volver a invitar.

Pendiente:
- A11y, loading states, seed realista, tests Vitest + Playwright.
- `noUncheckedIndexedAccess` en tsconfig (baja prioridad).
- Migración 005 para añadir política INSERT en audit_log (hoy parcheado vía service-client).

---

## 4. Workarounds operativos vigentes

Cosas reales del estado actual que hay que saber para no tropezar:

### 4.1 Auth por email — flujo OTP `token_hash` (no PKCE)
Brevo SMTP está configurado en Supabase Auth. El flujo de invite/reenvío de acceso usa el patrón OTP `token_hash` apuntando a `/auth/confirm`. PKCE seguía rompiendo cuando el destinatario abría el link desde otro dispositivo.

Cómo funciona:
1. **Invite admin** (crear comercial/gestor): `createInvitedProfile()` en [`lib/invite.ts`](lib/invite.ts) llama `auth.admin.generateLink({ type: "invite" })`, construye URL `/auth/confirm?token_hash=...&type=invite&next=...` y devuelve el link al admin para que lo comparta.
2. **Reenviar acceso**: `generateAccessLink()` en [`lib/auth/resend-link.ts`](lib/auth/resend-link.ts) hace lo mismo con `type=magiclink`. Server actions: `resendSalesAccess()` y `resendManagerAccess()`.
3. **Login normal del usuario**: [`app/login/LoginForm.tsx`](app/login/LoginForm.tsx) **sigue usando PKCE** con `signInWithOtp + emailRedirectTo=/auth/callback`. Para que el email mande al usuario a `/auth/confirm` con `token_hash` (más robusto), **hay que editar las plantillas en Supabase Dashboard manualmente**:
   - **Magic Link**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=%2F`
   - **Invite user**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=%2Fpanel`
   - Verificar `Site URL` y `Redirect URLs` en Authentication → URL Configuration incluyen `http://localhost:3000` y la URL de prod.
4. [`app/auth/confirm/route.ts`](app/auth/confirm/route.ts) hace `verifyOtp({ token_hash, type })` server-side y redirige a `next` (validado con `isSafeNext`).

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

---

## 7. Estado real de Supabase (snapshot 2026-05-21)

- **Proyecto**: `zejwmznusszqlwhevaqv.supabase.co`. Migraciones 001+002+003+004 aplicadas.
- **2 admins**: Alejandro Castillo + Rafael Ibáñez (ambos `@inseryal.es`).
- **1 comercial de prueba**: "Comercial prueba" / `comercial-prueba` / asignado a "Inseryal by Marina d'Or · Chamberí" / status `active`. Email: `a.castillo.esv@gmail.com`.
- **Gestor de prueba**: creado durante la sesión de auditoría (puede que haya sido eliminado antes de cerrar; verificar con `select * from profiles where role='reviews_manager'`).
- **1 cliente de prueba**: "Otto Castillo" / `otto-castillo`.
- **7 fichas**: 5 "Inseryal by Marina d'Or" (Oropesa + Madrid Pardiñas + Madrid Príncipe de Vergara + Leganés + Chamberí) y 2 "Marina d'Or Construcciones" (Castellón + Valencia). Solo Chamberí tiene `google_place_id`. Todas `oauth_status: disconnected`.
- **2 share_links** registradas. 0 reseñas.

Antes de actuar sobre datos, verifica con `curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/<tabla>?select=... -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`. La BD evoluciona.

---

## 8. Próximo paso recomendado

Producto funcional al 100% código + auditado en seguridad. Lo único pendiente es bloqueo externo + polish opcional:

1. **Esperar aprobación Google** (caso `5-5855000041022`, ETA ~2026-06-04). Sin esto el cron devuelve 429 y no entran reseñas reales — todo lo demás sigue operativo.
2. **Cuando Google apruebe**: probar OAuth E2E con `listAccounts`/`listLocations`/`listReviews`. Si todo va bien, conectar las 7 fichas desde `/fichas`.
3. **Despliegue a producción** (decisión 2026-05-21: **Vercel** sobre subdominio de `inseryal.es`). Cuando llegue el momento: conectar repo a Vercel → env vars → elegir subdominio (`app.inseryal.es` o `resenas.inseryal.es`) → CNAME a `cname.vercel-dns.com` desde DNS de SiteGround → actualizar `GOOGLE_OAUTH_REDIRECT_URI` y URLs de privacy/terms en consent screen → configurar Resend con dominio verificado → considerar publicar consent fuera de Testing (Verification de Google).
4. **Editar plantillas de email en Supabase Dashboard** para que `/login` también use `token_hash` en lugar de PKCE (ver §4.1). Mientras no se haga, el magic-link normal puede fallar con "PKCE code verifier not found" si el usuario abre el link en otro dispositivo o browser limpio.
5. **Polish (Fase 6 restante, opcional)**: a11y, loading states, seed más realista, tests Vitest + Playwright, `noUncheckedIndexedAccess`, migración 005 con política INSERT en audit_log.

---

## 9. Cómo mantener este archivo

Cada vez que termine una tanda significativa de trabajo:
1. Actualizar §3 (estado por fase) con lo que se ha hecho.
2. Si surge un workaround nuevo, añadir entrada a §4.
3. Si la BD cambia (nuevos users, fichas, etc.), actualizar §7.
4. Si se cierran open questions de la spec, marcarlas en `spec.md` §9.
5. Commit con mensaje descriptivo + push.

Los `MEMORY.md` que veas dentro de `~/.claude/projects/...` son **locales a cada Mac** — no se versionan. Lo importante para la continuidad es este `CLAUDE.md` y la `spec.md`.
