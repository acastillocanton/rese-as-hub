# Spec — ReseñaHub

> **Fuente de verdad del MVP.** Este documento define qué construimos, por qué, y cómo sabemos que está hecho. Si un cambio (de código, scope, o decisión arquitectónica) entra en conflicto con este archivo, **se actualiza la spec primero** y luego se implementa.
>
> Documento vivo · versión 0.3 · última edición 2026-05-22 · responsables (rol admin): Alejandro Castillo (`alejandro.castillo@inseryal.es`) y Rafael Ibáñez (`rafael.ibanez@inseryal.es`)

---

## 1. Objective

**Qué construimos**: una aplicación web interna llamada **ReseñaHub** para Inseryal by Marina d'Or (apartamentos turísticos en la playa, ~10 fichas de Google Business Profile, ~24 comerciales). La app sustituye el "parte semanal de reseñas" que hoy Raquel Piquer compila a mano en Excel.

**Para quién**:
- **Admin** (2 personas: Alejandro Castillo y Rafael Ibáñez) — visión global, alta/baja de fichas Google y comerciales, configuración del sistema.
- **Comercial** (sales) — recibe invitación, accede a su panel (escritorio + móvil), genera un enlace personalizado por cliente, ve sus reseñas y ranking.
- **Gestor de reseñas** (reviews_manager — perfil de Raquel Piquer) — entra en modo solo-lectura, filtra reseñas, descarga el Excel mensual.

**Por qué**:
1. Eliminar el trabajo manual semanal de Raquel.
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
| Integración externa | Google Places API (New) v1 (API key, sin OAuth — vía activa) + Google Business Profile API v1 + OAuth 2.0 (pendiente de cuota) | — |
| Email transaccional | Brevo SMTP vía Nodemailer (notificaciones al comercial cuando entra reseña counted) | — |
| Hosting + Cron | Vercel Hobby + dos Vercel Crons diarios (`0 5 * * *` Places, `5 5 * * *` Business Profile UTC) | — |
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
npm test               # Vitest unit (matcher + date-range + schemas + Places + reconcile, 75 tests)
npm run test:watch     # Vitest en modo watch
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
    resenas/verificacion/         06 · Motor de verificación
    fichas/                       Gestión de fichas Google + OAuth
    ajustes/
  (sales)/                        Layout + páginas del rol comercial
    panel/                        04+05 · Panel (responsive)
    clientes/                     Alta cliente + generar enlace
  (manager)/                      Layout + páginas del gestor de reseñas
    manager/resenas/              Listado solo-lectura
    manager/export/               Generador Excel
  c/[salesSlug]/                  Landing pública (route handler, sin layout)
  c/[salesSlug]/[clientSlug]/     Landing pública con cliente identificado
  auth/                           callback (magic-link) + signout
  api/cron/sync-google-reviews/   Cron Business Profile (pendiente cuota)
  api/cron/sync-places-reviews/   Cron Places API legacy (activo, reviews_sort=newest)
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
  utils.ts                        cn, slugify, initials, avatarColor
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
- **Playwright** para flujos E2E críticos. ⏳ Pendiente.

**Estado actual** (versión 0.3):

```
lib/__tests__/
  date-range.test.ts                 ✅ 14 tests (parseRange, thisMonthRange, lastMonth,
                                        lastQuarter, isFullNaturalMonth — incl. from > to,
                                        formato inválido, salto de año)
lib/matching/__tests__/
  attribute-review.test.ts           ✅ 22 tests (nameSimilarity completa, flujo con
                                        autor real, modo anonymous_author)
test/
  server-only-stub.ts                Stub para que Vitest pueda importar módulos con
                                     `import "server-only"`.

e2e/                                 ⏳ Pendiente — Playwright sin instalar
  invite-flow.spec.ts                ⏳
  share-link.spec.ts                 ⏳
  cron-attribution.spec.ts           ⏳
```

Tests existentes: **36 pasando**. `npm test` en <1s.

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

**Funcionales**:
- [ ] Admin puede dar de alta una ficha Google, conectarla por OAuth, y ver `oauth_status: connected`.
- [ ] Admin puede invitar a un comercial, asignarle ficha y objetivo mensual. El comercial recibe email y completa alta vía magic-link.
- [ ] Comercial puede registrar un cliente "María González" desde `/clientes` y obtener:
  - URL `reseñahub.es/c/{slug-comercial}/maria-gonzalez`
  - QR para imprimir
  - Deep-links pre-rellenados para WhatsApp / Email / SMS
- [ ] Abrir ese enlace lleva al cliente directamente a la URL de "escribir reseña" en Google sin landing intermedia (302 redirect en < 500 ms).
- [ ] Tras dejar una reseña real en Google, el cron job la detecta y la atribuye al comercial. La reseña aparece en su panel y en el dashboard del admin.
- [ ] Una reseña dejada en Google **sin** pasar por nuestro enlace queda como `unmatched` en la bandeja del admin (no se pierde).
- [ ] Gestor de reseñas entra en `/manager/resenas`, filtra "Marzo 2026 · Marina d'Or Oropesa" y descarga un Excel con las columnas pactadas.

**Cuantitativos**:
- [ ] **Tiempo de detección de reseña < 10 minutos** desde su publicación en Google hasta su aparición en el panel del comercial (medido vía timestamp `google_created_at` vs `fetched_at`).

**No-funcionales (mínimos, no objetivos duros)**:
- [x] `npm run build` y `npm run typecheck` pasan sin errores ni warnings nuevos. ✅ Validado 2026-05-23.
- [x] `npm test` pasa (75 tests verdes — matcher 22 + date-range 14 + schema importador 14 + cliente Places 20 + reconcileRemoved 5). ✅
- [ ] El servidor responde 200 en todas las rutas autenticadas con un usuario válido de cada rol.
- [x] Cabeceras de seguridad presentes (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`). ✅ CSP añadido 2026-05-22.
- [ ] No hay regresiones en el smoke test del README.

---

## 9. Open Questions

Cuestiones sin resolver que necesitan input antes (o durante) la implementación:

1. **Dominio definitivo de producción**. El diseño usa `reseñahub.es`; pendiente confirmar si se compra o usamos otro (¿`resenas.inseryal.es`?). No bloquea desarrollo local. **Dominio corporativo de emails confirmado**: `inseryal.es` (con "y").
2. **Branding final** (logo, paleta exacta, tipografía si se aparta de la del prototipo). El chat original dijo "logo placeholder, lo aporto luego". Hasta que llegue, usamos el cuadrado negro con `r` que tiene el prototipo.
3. **Cómo conecta el "CRM" al alta de cliente**. ¿Hay un CRM externo del que extraer nombres? Si lo hay, ¿API o export? En el MVP el comercial introduce el nombre a mano.
4. ~~**Plantilla del mensaje** de WhatsApp/Email/SMS que pre-rellenamos al generar el enlace.~~ **Cerrada 2026-05-21**: se implementa una plantilla por defecto editable por el comercial en el momento de envío. Vive en [`lib/messaging.ts`](lib/messaging.ts) (`DEFAULT_REVIEW_MESSAGE_TEMPLATE`) con variables `{nombre_cliente}`, `{nombre_comercial}`, `{url}`. Si se quiere centralizar la edición, mover a `/ajustes` cuando exista.
5. **Cuántos comerciales hay realmente** (24 en el mock, ~30 según contexto). Influye en cuotas de la GBP API y diseño del cron.
6. **Política de retención**. ¿Cuánto tiempo guardamos las reseñas en DB? ¿Eliminamos `share_links` antiguas (>90 días)?
7. **¿Quiere el admin recibir alertas** sobre reseñas ≤ 3★ en tiempo real (email/push)? El prototipo lo sugiere pero no se acordó.
8. **Encriptación del `oauth_refresh_token`** en reposo. Actualmente en texto plano dentro de `location_secrets` (aislada por RLS). Para producción: Supabase Vault o `pgcrypto`.
9. ~~**Configurar SMTP de Resend en Supabase**.~~ **Cerrada 2026-05-21**: se configuró **Brevo** SMTP para Supabase Auth (no Resend). El built-in hard-cap de 2 emails/h ya no es bloqueante. Plantillas en Supabase Dashboard usan el flujo OTP `token_hash` apuntando a `/auth/confirm` ([CLAUDE.md §4.1](CLAUDE.md)). Resend queda reservado para notificaciones transaccionales del cron al comercial (ver punto 7).
10. **Fichas multi-marca**. La BD tiene 7 locations: 5 "Inseryal by Marina d'Or" + 2 "Marina d'Or Construcciones". La spec hablaba originalmente solo de "Inseryal". Confirmar si "Marina d'Or Construcciones" entra en el scope del MVP o se queda fuera.
11. ~~**Comercial pasa a `status='active'` ¿cuándo?**.~~ **Cerrada 2026-05-21**: [`app/auth/confirm/route.ts`](app/auth/confirm/route.ts) flippea automáticamente `invited→active` tras un `verifyOtp` exitoso. `paused` se respeta. El admin sigue pudiendo forzar el estado desde la ficha del comercial.

---

## Referencias

- Plan inicial aprobado: `~/.claude/plans/vamos-a-desarrollar-una-kind-lovelace.md`.
- Bundle de diseño: `_design_package/ReseñaHub/`.
- Chat original con el design assistant: `_design_package/rese-ahub/chats/chat1.md`.
- README de setup operativo: [`README.md`](README.md).
