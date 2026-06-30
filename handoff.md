# Handoff — ReseñaHub

> Traspaso de trabajo (no de diseño). Para el handoff de integración de diseño desde Claude Design, ver [`handoff-template.md`](handoff-template.md).
>
> **Fuentes de verdad permanentes**: [`CLAUDE.md`](CLAUDE.md) (estado + workarounds) y [`spec.md`](spec.md) (producto). Este archivo resume la **última tanda de trabajo** y el estado operativo para retomar rápido. Las memorias locales (`~/.claude/projects/.../memory/`) NO viajan entre máquinas — la continuidad cross-máquina es CLAUDE.md + spec.md + este handoff.

**Última actualización**: 2026-06-30 · **Rama**: `main` · **HEAD**: `08bf57a` — comercial multi-oficina ("escrituradora", mig 031/032) + migraciones verificadas

---

## 0. Qué se hizo en la sesión del 2026-06-30 (escrituradora)

### Comercial multi-oficina · "escrituradora" (mig 031 + 032) — §4.60
Dirección pidió un actor que pida reseñas como un comercial más pero que **no pertenezca a una sola ficha**: la persona que acompaña la firma de escrituración pide reseñas para viviendas de cualquier promoción (Oropesa playa / Castellón / Valencia).

**Decisión de modelado** (con el usuario): NO es un rol nuevo. Es un `sales` con flag `profiles.cross_location = true` y **sin `location_id`**. Reutiliza TODO el rol sales (la RLS de sales gatea por `sales_id`, no por ficha). Cada **cliente** suyo guarda su ficha destino en `clients.location_id`; la landing y el matcher usan la ficha del cliente.

- **mig 031** (✅ aplicada, verificada en prod 2026-06-30): `profiles.cross_location` + `clients.location_id` + `locations.escrituracion_target` (backfill: las 3 fichas Oropesa/Castellón/Valencia, confirmado) + relaja `role_requires_location` (permite productor sin ficha si `cross_location`) + congela `cross_location` en `profiles_self_update` (regla §4.36; en `FROZEN_COLUMNS` del test).
- **mig 032** (✅ aplicada, verificada): la escrituradora puede **ver/reclamar huérfanas de cualquier ficha de escrituración** en Verificación. Helper `is_cross_location_producer()` + amplía `reviews_unmatched_location_select` y `reviews_sales_claim_update` con la rama cross_location→escrituracion_target. El WITH CHECK del claim NO se relaja.
- **Código** (commits `b8a7bd3` + `8dcd323`):
  - Landing ([lib/landing.ts](lib/landing.ts)): `effectiveLocationId = client.location_id ?? sales.location_id`; place_id + `share_links.location_id` salen de ahí.
  - Alta de cliente con `<select>` de ficha ([NewClientButton](app/(sales)/clientes/NewClientButton.tsx)); `createClientRecord` exige+valida `locationId` (escrituracion_target) cuando cross_location.
  - Gestión: casilla "Comercial multi-oficina" en `InviteSalesButton`/`SalesEditCard` (solo admin/reviews_manager; un director no).
  - Matcher: helper [lib/cron/cross-location-roster.ts](lib/cron/cross-location-roster.ts) añade a la escrituradora al roster de cada ficha donde tiene clientes (rescate por mención §4.38). En ambos crons.
  - Marca del mensaje por cliente (la de su ficha, no la del perfil) + enlace genérico oculto (`/panel/enlace` redirige a Mis clientes; tarjeta del panel oculta).
  - `claimReview`: el cliente nuevo inline hereda la ficha de la reseña reclamada.
- **Verificado**: typecheck + 435 tests verdes (incl. `cross_location` en el test de regresión RLS). Falta solo la acción de negocio: **invitar a la persona** marcando la casilla.
- Detalle completo: **CLAUDE.md §4.60**.

### Migraciones 030/031/032 verificadas aplicadas (commit `08bf57a`)
Se comprobó contra Supabase (REST + SQL Editor) que **030, 031 y 032 están aplicadas**. La doc (CLAUDE.md §4.59/§7 + memoria) marcaba la 030 como pendiente — corregido. **No queda ninguna migración pendiente.**
- 030 (hardening seguridad): policy `audit_log_self_insert` eliminada; trigger `trg_audit_commission` + función `audit_commission_change` presentes.

---

## 1. Estado operativo

- **Migraciones 001–032 TODAS aplicadas** en Supabase. Nada pendiente.
- **Business Profile**: cuota ACTIVA, fuente única. 7 fichas conectadas por OAuth (`accounts/111197444117937021993`), consent screen en **Producción** (tokens ya no caducan a 7 días, §4.58). Places apagado. Diagnóstico: `node scripts/check-bp-quota.mjs`.
- **Escrituradora**: feature lista en código + BD. Pendiente solo invitar a la persona real desde `/comerciales` (casilla "multi-oficina").
- **Tests**: `npm test` → **435 verdes**. `npm run typecheck` ✅. `npm run lint` solo warnings preexistentes.
- **Deploy**: todo pusheado a `main`. Verificar en Vercel que el último deploy está **Ready**.

---

## 2. Cómo verificar (humo, en prod)

1. `/comerciales` → "Invitar comercial": aparece casilla **"Comercial multi-oficina (escrituración)"** (solo admin/gestor). Al marcarla desaparecen Departamento/Ficha/Responsable.
2. Como escrituradora, **Mis clientes → + Nuevo cliente**: pide elegir oficina (Oropesa/Castellón/Valencia). El enlace `/c/{ella}/{cliente}` hace 302 a la ficha correcta y la fila en `share_links` lleva esa `location_id`.
3. `/resenas/verificacion` (como escrituradora) → "Sin atribuir": ve huérfanas de las 3 fichas; botón "Es mía" para reclamar.
4. Comercial normal: sin selector de ficha, todo igual que antes (no-regresión).

---

## 3. Watch-outs / gotchas al retomar

- ⚠️ **Email de commit para Vercel**: usar **`alejandro.castillo@inseryal.es`** (config del repo). NO gmail — Vercel bloquea el deploy.
- ⚠️ **"Responsable" en la UI == rol `office_director`** en código (solo cambió texto visible; rol/`director_id`/ruta `/directores` intactos). §4.55.
- ⚠️ **RLS `profiles_self_update`**: al añadir CUALQUIER columna sensible a `profiles`, congélala en la policy (mig más reciente) + añádela a `FROZEN_COLUMNS` en [lib/__tests__/rls-self-update.test.ts](lib/__tests__/rls-self-update.test.ts). §4.36.
- ⚠️ **Comisión con tope**: cualquier superficie que muestre € de comisión usa `lib/commission.ts` (`commissionEuro`/`payableCount`), no `rate × counted`. §4.49.
- ⚠️ **BP going-forward**: el cron solo importa reseñas con `createTime >= BP_GO_LIVE_AT`. Histórico fuera (suprimir alertas ≤2★ si algún día se carga).
- ⚠️ **Soft-delete automático DESACTIVADO** (`AUTO_REMOVE_ENABLED=false`, §4.20): feed de Google flaky marcaba counted legítimas como eliminadas. NO reactivar sin rediseñar.
- **Migraciones**: las aplica el usuario a mano en Supabase → SQL Editor. Confirmar aplicada antes de pushear código que lea una columna nueva. (Verificación rápida: para columnas/funciones-que-devuelven-dato, `curl .../rest/v1/<tabla>?select=<col>` o `/rpc/<fn>`; para policies/triggers, SQL contra `pg_policies`/`pg_trigger`/`pg_proc`.)

---

## 4. Pendientes (contexto)

- **Escrituradora — refinamientos opcionales** (no bloqueantes): el desplegable de clientes al reclamar muestra TODOS sus clientes (de las 3 fichas), no filtra por la ficha de la reseña — sin corrupción de datos. Limitaciones aceptadas: no sale en el parte Excel por departamento; sus reseñas no las ve el director de oficina (sí admin/gestor); `branch="—"` en ranking. Ver §4.60.
- **BP — pendientes deliberados** (§4.50): deep-link a reseña concreta (descartado, Google no expone URL por reviewId); soft-delete automático (desactivado, §4.20).
- **Verificación de Google del consent screen** (§4.58/§4.59): la app está en Producción pero "sin verificar" (aviso "app no verificada" → Avanzado → Continuar, tope 100 usuarios). Quitar el aviso es follow-up no urgente.
- **Backlog v2 / open questions**: CLAUDE.md §8 + spec.md §9 (dominio, branding, CRM, retención, cifrar `oauth_refresh_token`).

---

## 5. Comandos

```bash
npm run dev          # dev en localhost:3000 (Turbopack)
npm run typecheck    # gate antes de cerrar tarea
npm test             # Vitest (435 verdes)
npm run build        # build producción
npm run lint         # next lint
```
