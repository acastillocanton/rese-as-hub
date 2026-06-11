# Spec — ReseñaHub

> **Fuente de verdad del producto.** Este documento define qué construimos, por qué, y cómo sabemos que está hecho. Si un cambio (de código, scope, o decisión arquitectónica) entra en conflicto con este archivo, **se actualiza la spec primero** y luego se implementa.
>
> Documento vivo · versión 1.0 (v1 cerrada el 2026-05-26) · última edición 2026-06-01 · responsables (rol admin): Alejandro Castillo (`alejandro.castillo@inseryal.es`) y Rafael Ibáñez (`rafael.ibanez@inseryal.es`)
>
> 🏁 **V1 cerrada el 2026-05-26**. MVP completo, live en producción. **🎉 Google Business Profile API activada el 2026-06-10** (fuente única de reseñas going-forward; Places API apagado). **v2 (jun 2026)**: anti-fraude, verificación abierta, alertas ≤2★, plantillas de mensaje, panel "Histórico/ranking/insignias", **modelo de comisión (periodo 20→20 + tarifa €/reseña + tope de reseñas bonificables)**, soporte interno, responder reseñas de Google y endurecimiento de seguridad. Ver §9 (cerradas v2) y `CLAUDE.md` §3/§4 (§4.50 BP).

---

## 1. Objective

**Qué construimos**: una aplicación web interna llamada **ReseñaHub** para Inseryal by Marina d'Or (apartamentos turísticos en la playa, 7 fichas de Google Business Profile en producción, 51 perfiles productivos cargados — 40 comerciales + 11 directores de oficina, datos reales del Excel `Reseñas MARZO.xlsx` y screenshots Castellón/Valencia). La app sustituye el "parte semanal de reseñas" que hasta ahora se compilaba a mano en Excel.

**Para quién**:
- **Admin** (2 personas: Alejandro Castillo y Rafael Ibáñez) — visión global, alta/baja de fichas Google, directores y gestores, configuración del sistema.
- **Director de oficina** (office_director, migraciones 011-013) — rol DUAL: admin scoped a SU EQUIPO de comerciales (`profiles.director_id`) **+ comercial productor** (tiene su propio `/c/{slug}`, clientes y reseñas atribuidas como un sales). Tiene los mismos campos productivos que un sales (department, language si internacional, monthly_goal) y aparece en leaderboard/Excel marcado con "★". Una location puede tener varios directores, cada uno con su equipo. Gestiona los comerciales de su equipo, verifica sus reseñas, exporta su Excel. NO accede a `/gestores`, `/directores`, `/ajustes` ni `/fichas` (la gestión de fichas Google y el flujo OAuth son solo-admin desde 2026-06-10, commit `b8ef681`). Solo admin / reviews_manager lo invitan/editan/archivan desde `/directores`.
- **Comercial** (sales) — recibe invitación, accede a su panel (escritorio + móvil), genera un enlace personalizado por cliente, ve sus reseñas y ranking. Puede tener un `director_id` asignado (su responsable directo dentro de la ficha) o quedar en el pool del admin/reviews_manager si es null. Desde mig 016 también accede a `/resenas/verificacion` con permiso acotado a "Reclamar" reseñas huérfanas (unmatched) de SU ficha — útil cuando un cliente deja reseña sin pasar por el enlace personal.
- **Gestor de reseñas** (reviews_manager) — comparte vista global con admin (dashboard + comerciales) y tiene plenos permisos sobre el rol sales (invitar, editar, eliminar, reasignar `director_id`). Pantallas adicionales: `/manager/resenas`, `/manager/export` y `/resenas/verificacion` (paridad con admin tras mig 016: confirm/reject/reassign/markRemoved/restore). NO accede a `/gestores`, `/directores`, `/fichas`, `/ajustes`.

**Por qué**:
1. Eliminar el trabajo manual semanal del gestor de reseñas.
2. Atribuir cada reseña al comercial que la consiguió de forma fiable y automática.
3. Dar al comercial métricas en vivo y reducir la fricción de pedir la reseña (un enlace que va directo a Google).

**Definition of Done del MVP**: ver §8 Success Criteria.

---

## 2. Tech Stack

| Capa | Tecnología | Versión |
|------|------------|---------|
| Framework | Next.js (App Router, Turbopack) | 15.5.18 |
| Lenguaje | TypeScript strict (+ `noUncheckedIndexedAccess`) | 5.7 |
| UI | React 19 + CSS variables (tokens del diseño) + Tailwind | 4.x utility classes |
| Backend / DB | Supabase (Postgres + Auth + RLS) | hosted |
| Auth | Magic-link vía Supabase Auth (Brevo SMTP) + roles aplicados con middleware + RLS | — |
| Integración externa | Google Business Profile API v1/v4 + OAuth 2.0 (fuente única de reseñas desde 2026-06-10; Places API legacy apagado pero reactivable). Incluye **responder reseñas en un clic** por API (reply v4) + detección de respuestas puestas directo en Google | — |
| Email transaccional | Brevo SMTP vía Nodemailer (notificaciones al comercial cuando entra reseña counted) | — |
| Hosting + Cron | Vercel Hobby + **un** Vercel Cron diario (`5 5 * * *` Business Profile UTC) + GitHub Action horaria (`sync-reviews-hourly.yml`). El cron de Places se quitó al apagar Places (2026-06-10) | — |
| Excel | ExcelJS (server-side, dynamic import) | 4.4 |
| QR | qrcode.react | 4.2 |
| Validación | Zod | 3.23 |
| Tests | Vitest (unit, en `lib/__tests__` y `lib/matching/__tests__`) | 4.x |

**Single-tenant**: una sola empresa (Inseryal). No multi-empresa.

---

## 3. Commands

Todos desde la raíz del repo en una shell con Node 22+.

```bash
npm install            # primera vez
npm run dev            # arranca dev con Turbopack en http://localhost:3000
npm run build          # build de producción (verifica tipos y compila)
npm run start          # server de producción tras npm run build
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
npm test               # Vitest unit (329 tests: matcher + date-range + commission + Places + reconcile + leaderboard + branding + messaging + role/route + duplicate-detection + verification-gating + reply-gating + review-url + strip-translation + owner-reply + sales-report + orphan-reviews + low-rating-alerts + panel-badges + sales-schemas + excel-safe + edit-merge + rls-self-update)
npm run test:watch     # Vitest en modo watch
npm run test:e2e       # Playwright E2E (login + admin-nav). Primera vez: npx playwright install --with-deps chromium
npm run test:e2e:ui    # Playwright en modo UI interactivo
```

**Operaciones con la base de datos** (cuando Supabase esté conectado):

```bash
# Ejecutar migraciones en el SQL Editor del dashboard de Supabase, en orden:
#   supabase/migrations/001_initial_schema.sql
#   supabase/migrations/002_rls_policies.sql
#   supabase/migrations/003_seed_demo.sql       (opcional, datos demo)
#   supabase/migrations/004_google_oauth.sql
#   supabase/migrations/005_manager_sales_admin.sql
#   supabase/migrations/006_profile_avatars.sql
#   supabase/migrations/007_reviews_composite_indices.sql
#   supabase/migrations/008_audit_log_insert_policy.sql
#   supabase/migrations/009_review_source.sql
```

**Disparar los crons manualmente** (con `CRON_SECRET` configurado):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-places-reviews
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-google-reviews
```

---

## 4. Project Structure

```
app/                              Next.js App Router
  (admin)/                        Layout + páginas del rol admin
    dashboard/                    01 · Dashboard general
    comerciales/                  02 · Lista
    comerciales/[slug]/           03 · Ficha del comercial
    fichas/                       Gestión de fichas Google + OAuth
    ajustes/
  (sales)/                        Layout + páginas del rol comercial
    panel/                        04+05 · Panel (responsive)
    clientes/                     Alta cliente + generar enlace
  (manager)/                      Layout + páginas del gestor de reseñas
    manager/resenas/              Listado solo-lectura
    manager/export/               Generador Excel
  (profile)/                      Layout compartido (4 roles)
    perfil/                       Datos personales + avatar
    ayuda/                        Centro de ayuda
    resenas/verificacion/         06 · Motor de verificación (mig 016: 4 roles con permisos por rol)
    perfil/                       Foto + datos + cerrar sesión
    ayuda/                        Manual del comercial v2 (14 secciones + glosario + capturas)
  c/[salesSlug]/                  Landing pública (route handler, sin layout)
  c/[salesSlug]/[clientSlug]/     Landing pública con cliente identificado
  auth/                           callback (magic-link) + signout
  api/cron/sync-google-reviews/   Cron Business Profile (fuente única, activo desde 2026-06-10)
  api/cron/sync-places-reviews/   Cron Places API legacy (apagado 2026-06-10; reactivable)
  api/sync/now/                   Sync manual on-demand (autenticado por sesión)
  login/                          Pantalla de login + server action
  accept-invite/[token]/          Onboarding del comercial invitado

components/
  ui/                             Card, Stat, GhostBtn, Avatar, Stars, Progress,
                                  Seg, Pill, DateRange, ComingSoon
  charts/                         Sparkline, MonthBars, AreaChart, Ring
  layout/                         Frame, Sidebar (admin/sales/manager), Topbar

lib/
  supabase/                       client.ts (browser) · server.ts (RSC) ·
                                  middleware.ts (edge auth) · service.ts (service role) ·
                                  config.ts (isSupabaseConfigured) · types.ts (Database)
  matching/                       attribute-review.ts + tests (22)
  google/                         business-profile.ts (OAuth) + places.ts (API key)
  cron/                           process-reviews.ts (helper compartido)
  landing.ts                      Lógica del /c/* (service-role insert + redirect)
  url-validation.ts               isSafeNext, isValidSlug
  utils.ts                        cn, slugify (translitera cirílico→latino), transliterateCyrillic, initials, avatarColor
  demo-data.ts                    Datos placeholder (modo demo sin Supabase)

supabase/
  migrations/                     001_initial_schema, 002_rls_policies, 003_seed_demo

middleware.ts                     Auth + roles + redirección por rol
next.config.ts                    Cabeceras de seguridad
tailwind.config.ts                Mapeo CSS vars → tokens Tailwind
spec.md                           Este documento
README.md                         Setup y operativa
_design_package/                  Bundle original de Claude Design (NO modificar)
```

Carpetas marcadas "pendiente" se crean al implementar la fase correspondiente.

---

## 5. Code Style

**Defaults de Next.js**: ESLint `next/core-web-vitals` + Prettier sin config custom + TypeScript strict. Sin reglas adicionales.

**Convenciones clave**:

- Componentes en PascalCase, archivos `.tsx` por componente individual.
- Server components por defecto. `"use client"` solo cuando se necesita estado/eventos.
- Server actions en `actions.ts` adyacente a la página (`app/login/actions.ts`).
- Slugs en `kebab-case`, ASCII-only (`carla-ruiz`, no `carlá-ruíz`).
- IDs de tabla: `uuid` siempre, generados por Postgres (`gen_random_uuid()`).
- Tiempos: `timestamptz` en DB; en TS se manejan como `string` ISO 8601.

**Ejemplo de estilo** (extracto real de la pantalla del admin):

```tsx
// app/(admin)/dashboard/page.tsx
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { TEAM, SERIES_VERIFIED } from "@/lib/demo-data";

export default function DashboardPage() {
  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Dashboard general"
        right={<GhostBtn primary>Invitar comercial</GhostBtn>}
      />
      <div style={{ flex: 1, padding: "24px 32px 32px", overflow: "auto" }}>
        <Stat label="Reseñas totales" value="459" delta="+18,6%" />
        ...
      </div>
    </>
  );
}
```

**Estilos**: tokens vía CSS vars (`var(--ink)`, `var(--surface)`). Estilos inline para layout específico de cada pantalla (consistente con el prototipo). Tailwind disponible pero usado con moderación — la mayoría del look viene de los tokens.

**Sin comentarios redundantes**. Solo comentarios cuando el "por qué" no es obvio (ej. la nota en `lib/supabase/service.ts` explicando cuándo NO usar el service-role).

---

## 6. Testing Strategy

Nivel **mínimo** acordado para el MVP. Objetivo: cubrir lo que duele si rompe, no perseguir cobertura.

**Frameworks**:
- **Vitest** para unit tests de `lib/*` (matching, validation, utils). ✅ Configurado con `vitest.config.ts` (alias `@/*`, stub para `server-only`).
- **Playwright** para flujos E2E críticos. ✅ Configurado en `playwright.config.ts` con helper de auth via `/login/manual?token=…`.

**Estado actual** (versión 1.0):

```
lib/__tests__/
  date-range.test.ts                 ✅ 14 tests
  leaderboard.test.ts                ✅ tests (compute + isSelf + scope equipo)
  branding.test.ts                   ✅
  messaging.test.ts                  ✅
  role-helpers.test.ts               ✅
  route-access.test.ts               ✅
lib/matching/__tests__/
  attribute-review.test.ts           ✅ 22 tests (nameSimilarity completa, autor real,
                                        modo anonymous_author)
lib/google/__tests__/
  places.test.ts                     ✅ 20 tests (cliente Places legacy)
  sync-places.test.ts                ✅ 5 tests (reconcileRemoved)
test/
  server-only-stub.ts                Stub para que Vitest importe módulos `server-only`.

e2e/                                 ✅ Setup completo
  helpers/auth.ts                    loginAs() vía /login/manual + service-role
  login.spec.ts                      ✅ admin → /dashboard, /login renderiza form
  admin-nav.spec.ts                  ✅ smoke /comerciales, /ranking, /fichas, /manager
  playwright.config.ts (raíz)        chromium + mobile-chromium, webServer auto
```

Tests existentes: **99 unit + 4 E2E** pasando. `npm test` en <1s; `npm run test:e2e` en <30s.

**Pendiente v2**: sales-flow E2E (crear cliente → compartir enlace) cuando haya un sales fijo de pruebas en BD; cron con fixture Google API.

**Sin objetivo numérico de cobertura**. El criterio es: ¿este código fallaría silenciosamente en producción si lo rompemos? Si la respuesta es sí, hay test.

**Cuándo se ejecutan**:
- En local antes de cada commit relevante: `npm test`.
- En CI (cuando montemos GitHub Actions): unit + e2e contra Supabase efímero.

---

## 7. Boundaries

### Always do

- **Validar inputs externos** en el límite del sistema (Zod en server actions, `isValidSlug`/`isSafeNext` en route handlers, parsers en webhooks).
- **Parametrizar consultas** — siempre vía el query builder de Supabase, nunca concatenando strings.
- **Aplicar RLS** en toda tabla con datos sensibles. Tablas con secretos (`location_secrets`) tienen RLS habilitada sin políticas — solo service-role accede.
- **Usar `createServiceClient`** únicamente desde código server-only no expuesto al usuario (cron, landing pública, server actions internas). Nunca importarlo desde un componente cliente.
- **Ejecutar `npm run typecheck`** antes de dar por completada una tarea.
- **Actualizar la spec** cuando una decisión cambie.

### Ask first

Cambios que requieren confirmación explícita del usuario antes de aplicar:

- **Migraciones de DB nuevas** (`supabase/migrations/00X_*.sql`) — cualquier cambio al esquema o RLS.
- **Cambios al modelo de matching** — algoritmo de atribución, umbrales de confianza, ventana temporal.
- **Cambios al sidebar / IA de las pantallas** — añadir o reorganizar entradas del menú, mover páginas entre roles.

### Never do

- **Nunca commitear secretos** (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`). `.env*.local` está en `.gitignore`.
- **Nunca exponer el service-role key** a un componente cliente o vía cabecera/JSON.
- **Nunca devolver `oauth_refresh_token`** ni nada de `location_secrets` desde un endpoint accesible al usuario.
- **Nunca confiar en validación cliente** como límite de seguridad. Toda validación duplicada en server.
- **Nunca hacer redirect a URLs externas** desde un parámetro de query sin pasar por `isSafeNext`.
- **Nunca tocar `_design_package/`** — es referencia de diseño, no código fuente.
- **Nunca borrar tests sin aprobación** ni desactivar reglas de seguridad para conveniencia.

---

## 8. Success Criteria

El MVP está hecho cuando **todas** estas condiciones son verdad:

**Funcionales** (✅ todos verificados al cerrar v1):
- [x] Admin puede dar de alta una ficha Google, conectarla por OAuth (o solo Place ID para Places API), y ver el estado de sincronización en `/fichas`.
- [x] Admin puede invitar a un comercial, asignarle ficha y objetivo mensual. El comercial recibe email y completa alta vía magic-link.
- [x] Comercial puede registrar un cliente desde `/clientes` y obtener URL `{appBase}/c/{sales-slug}/{client-slug}`, QR para imprimir, y deep-links WhatsApp/Email/SMS. El mensaje ofrece **3 plantillas** según perfil (recién atendido / reavivar visita / breve) y el comercial puede personalizarlas a su tono en `/panel/plantillas` (persisten en `profiles.message_templates`, mig 019).
- [x] Abrir ese enlace lleva al cliente directamente a la URL de "escribir reseña" en Google sin landing intermedia (302 redirect).
- [x] Tras dejar una reseña real en Google, el cron Places la detecta (en producción desde 2026-05-23) y la atribuye al comercial via matcher (ventana 48h + similitud nombre + modo anonymous). Aparece en panel + dashboard.
- [x] Una reseña dejada **sin** pasar por nuestro enlace queda como `unmatched` en `/resenas/verificacion` (no se pierde).
- [x] Gestor entra en `/manager/resenas`, filtra y descarga un Excel mensual con `/manager/export`.

**Cuantitativos**:
- [x] **Tiempo de detección con cron horario GitHub Action**: ~1h máximo (5 reseñas/ficha por sync, suficiente para fichas activas; Business Profile API paginará completo cuando llegue cuota).

**No-funcionales** (✅ todos verificados al cerrar v1):
- [x] `npm run build` y `npm run typecheck` pasan sin errores. Verificado 2026-05-26.
- [x] `npm test` pasa (99 tests verdes). Verificado 2026-05-26.
- [x] `npm run test:e2e` pasa (login + admin-nav smoke). Verificado 2026-05-26.
- [x] Lint pasa (0 errors, ~20 warnings de deuda documentada — modal backdrops + `<img>` vs next/image). Verificado 2026-05-26.
- [x] El middleware redirige por rol y el servidor responde 200 en todas las rutas autenticadas con un usuario válido de cada rol.
- [x] Cabeceras de seguridad presentes (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`). CSP añadido 2026-05-22.

---

## 9. Open Questions

Cuestiones sin resolver que necesitan input antes (o durante) la implementación. Las marcadas con ~~tachado~~ se cerraron en v1; las abiertas pasan al **backlog v2** (`CLAUDE.md` §8).

**Cerrada en v2 (2026-05-26) · Anti-fraude por enlace de cliente**: cuando un cliente reenvía su enlace a familia/amigos, varias reseñas pueden llegar al mismo `client_id`. **Decisión**: todas se atribuyen al mismo `sales_id` (correcto — el comercial sabe que su cliente trajo más gente), pero solo la primera por `google_created_at` cuenta en KPIs/pagos. Migración 015 introduce `reviews.is_duplicate boolean`. Ver `CLAUDE.md` §4.23 para el flujo completo (cron + server actions + UI badge + Excel).

**Cerrada en v2 (2026-06-01) · Modelo de comisión por reseña**: a los productores (comerciales + directores) se les abona una **comisión por cada reseña verificada**. **Decisiones de negocio**: (a) el **periodo de liquidación va del día 20 al día 19 del mes siguiente** (no el mes natural) — el día 20 abre periodo nuevo, sin solapamientos; (b) **abonable = solo `match_state='counted'`, no-duplicada, no-eliminada** (las `pending` son "potenciales" hasta verificarse); (c) **tarifa €/reseña por productor** (`profiles.commission_rate`, migración 020); (d) **tope de reseñas bonificables por periodo** (`profiles.commission_cap`, default 5, configurable por productor, migración 026, 2026-06-10): se abona un máximo de N reseñas/periodo → importe estimado = `min(counted, commission_cap) × commission_rate`. El comercial puede conseguir más (suman a producción/ranking/insignias) pero solo cobra hasta el tope; la UI muestra las reales + cuántas van bonificadas + aviso. El panel del comercial muestra ese periodo por defecto + el importe estimado. ⚠️ La app **solo muestra** el estimado; **no** calcula nóminas ni registra pagos reales (la liquidación final sigue siendo externa). Ver `CLAUDE.md` §4.35 y §4.49.

1. **Dominio definitivo de producción**. El diseño usa `reseñahub.es`; pendiente confirmar si se compra o usamos otro (¿`resenas.inseryal.es`?). No bloquea desarrollo local. **Dominio corporativo de emails confirmado**: `inseryal.es` (con "y").
2. **Branding final** (logo, paleta exacta, tipografía si se aparta de la del prototipo). El chat original dijo "logo placeholder, lo aporto luego". Hasta que llegue, usamos el cuadrado negro con `r` que tiene el prototipo.
3. **Cómo conecta el "CRM" al alta de cliente**. ¿Hay un CRM externo del que extraer nombres? Si lo hay, ¿API o export? En el MVP el comercial introduce el nombre a mano.
4. ~~**Plantilla del mensaje** de WhatsApp/Email/SMS que pre-rellenamos al generar el enlace.~~ **Cerrada 2026-05-21 + 2026-05-25**: plantilla por defecto editable por el comercial en el momento de envío. Vive en [`lib/messaging.ts`](lib/messaging.ts) (`getDefaultReviewMessageTemplate(brand)` + `getGenericLinkTemplate(brand)`) con variables `{nombre_cliente}`, `{nombre_comercial}`, `{url}`. **2026-05-25**: multi-marca — la plantilla interpola la marca operativa de la `location` del comercial (`"...de Marina d'Or Construcciones"` o `"...de Inseryal by Marina d'Or"`).
5. ~~**Cuántos comerciales hay realmente** (24 en el mock, ~30 según contexto). Influye en cuotas de la GBP API y diseño del cron.~~ **Cerrada 2026-05-25**: 51 perfiles productivos cargados en BD (40 comerciales + 11 directores de oficina) distribuidos en 4 departamentos (nacional 21, internacional 16, castellón 7, valencia 7). `joined_at` real backfilleado desde Excel + screenshots para 45/51 (los 6 restantes sin fecha confirmada conservan el seed). Sin impacto en cuotas de Places API (consume ~126 req/día con 7 fichas) ni en Business Profile cuando llegue.
6. **Política de retención**. ¿Cuánto tiempo guardamos las reseñas en DB? ¿Eliminamos `share_links` antiguas (>90 días)?
7. ~~**¿Quiere el admin recibir alertas** sobre reseñas ≤ 3★ en tiempo real (email/push)? El prototipo lo sugiere pero no se acordó.~~ **Cerrada 2026-05-26**: implementado con threshold `≤2★` (decisión: 3★ se considera tibia, no crítica). Migración 017 añade `reviews.low_rating_alerted_at`; el cron envía email a admin + reviews_manager + director responsable + sales atribuido vía BCC, con CTA a `/resenas/verificacion` y a la ficha en Google. Banner en `/dashboard` cuando hay reseñas ≤2★ en el periodo. Ver `CLAUDE.md §4.29`.
8. **Encriptación del `oauth_refresh_token`** en reposo. Actualmente en texto plano dentro de `location_secrets` (aislada por RLS). Para producción: Supabase Vault o `pgcrypto`.
9. ~~**Configurar SMTP de Resend en Supabase**.~~ **Cerrada 2026-05-21**: se configuró **Brevo** SMTP para Supabase Auth (no Resend). El built-in hard-cap de 2 emails/h ya no es bloqueante. Plantillas en Supabase Dashboard usan el flujo OTP `token_hash` apuntando a `/auth/confirm` ([CLAUDE.md §4.1](CLAUDE.md)). Resend queda reservado para notificaciones transaccionales del cron al comercial (ver punto 7).
10. ~~**Fichas multi-marca**. La BD tiene 7 locations: 5 "Inseryal by Marina d'Or" + 2 "Marina d'Or Construcciones". La spec hablaba originalmente solo de "Inseryal".~~ **Cerrada 2026-05-25**: las dos marcas entran en MVP. Migración 014 añade `locations.brand` (enum `inseryal` / `marina_dor_construcciones`). El subtítulo del sidebar, breadcrumb de topbar, plantilla del mensaje al cliente y email transaccional al comercial usan la marca derivada de la `location` del usuario / reseña. Páginas legales y centro de ayuda se mantienen genéricas (entidad jurídica única del grupo). Ver CLAUDE.md §4.22.
11. ~~**Comercial pasa a `status='active'` ¿cuándo?**.~~ **Cerrada 2026-05-21**: [`app/auth/confirm/route.ts`](app/auth/confirm/route.ts) flippea automáticamente `invited→active` tras un `verifyOtp` exitoso. `paused` se respeta. El admin sigue pudiendo forzar el estado desde la ficha del comercial.

---

## Referencias

- Plan inicial aprobado: `~/.claude/plans/vamos-a-desarrollar-una-kind-lovelace.md`.
- Bundle de diseño: `_design_package/ReseñaHub/`.
- Chat original con el design assistant: `_design_package/rese-ahub/chats/chat1.md`.
- README de setup operativo: [`README.md`](README.md).
