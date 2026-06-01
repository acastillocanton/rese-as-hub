# Handoff — ReseñaHub

> Traspaso de trabajo (no de diseño). Para el handoff de integración de diseño desde Claude Design, ver [`handoff-template.md`](handoff-template.md).
>
> **Fuentes de verdad permanentes**: [`CLAUDE.md`](CLAUDE.md) (estado + workarounds) y [`spec.md`](spec.md) (producto). Este archivo resume la **última tanda de trabajo** y el estado operativo para retomar rápido. Las memorias locales (`~/.claude/projects/.../memory/`) NO viajan entre máquinas — la continuidad cross-máquina es CLAUDE.md + spec.md + este handoff.

**Última actualización**: 2026-06-01 · **Rama**: `main` · **HEAD**: `1a2b5a2`

---

## 1. Qué se hizo en la última sesión (2026-06-01)

### A. Tres plantillas de mensaje por cliente, personalizables por comercial (mig 019)
Feature completa. El comercial ahora, al compartir el enlace de un cliente, elige entre **3 plantillas** y puede personalizar **nombre + cuerpo** de cada una, guardándose en su perfil.

- **Plantillas base** (`lib/messaging.ts` → `MESSAGE_TEMPLATES`): `post_visita` (la histórica = default) · `reavivar` (visita antigua) · `breve` (corta e informal). Cada una: `label` (nombre) + `build(brand)` (cuerpo con `{nombre_cliente}/{nombre_comercial}/{url}`).
- **Resolución**: `resolveTemplate(id, brand, overrides)` = cuerpo; `resolveLabel(id, overrides)` = nombre. Override del comercial si existe, base si no. Nombre y cuerpo independientes.
- **Persistencia**: `profiles.message_templates jsonb`, shape `{ [id]: { label?, body? } }`. Escritura server-only con service-client filtrando por `id = auth.uid()` (sin RLS nueva).
- **UI**:
  - Selector de 3 pestañas en `ShareBlock` (diálogo al crear cliente, "Ver enlace", detalle del cliente). Las pestañas muestran el nombre personalizado. Retoque del textarea efímero por envío.
  - Editor en **`/panel/plantillas`** (`MyTemplatesEditor.tsx` + `actions.ts::saveMessageTemplates`). Accesible desde card en `/panel/enlace` y link "Editar mis plantillas →" en el diálogo.
- **Alcance**: solo enlace por cliente. El enlace genérico (`/panel/enlace` → `LinkArsenalBlock`) mantiene su plantilla única (decisión de producto).
- Detalle completo: **CLAUDE.md §4.31**. Memoria: `v2-message-templates-status`.

### B. Fix del callout del objetivo en `/panel` (desktop vs mobile)
El callout motivacional se superponía en desktop tras un cambio previo que lo expandió a ancho completo para mobile. Solución: `maxWidth: 240` inline (desktop) + clase `m-callout-wide` que solo en ≤767px lo libera a ancho completo. Detalle: **CLAUDE.md §4.32**.

### C. Corrección de la memoria del email de Vercel
La nota de memoria decía usar `socialmedia.inseryal@gmail.com` — era **incorrecta** y bloqueó un deploy. El email correcto es **`alejandro.castillo@inseryal.es`** (el del repo). Ver §4 abajo y memoria `vercel-hobby-author-email`.

### Commits de la sesión
```
1a2b5a2 fix(panel): callout del objetivo — contenido en desktop, ancho completo en mobile
054e84f docs(readme): actualizar rutas, estructura, migraciones (016-019) y nº de tests
4ebcb3e fix(panel): callout del objetivo mensual se superponía en desktop  (intento, ver 1a2b5a2)
5fd1544 feat(plantillas): el comercial puede renombrar cada plantilla, no solo el cuerpo
b184bfb feat(plantillas): 3 plantillas de mensaje por cliente + personalizables (mig 019)
```

---

## 2. Estado operativo

- **Migración 019**: ✅ aplicada y verificada en prod (`select message_templates` → HTTP 200). Migraciones 001–019 aplicadas.
- **Deploy**: pusheado a `main`. Verificar en Vercel que el último deploy (`1a2b5a2`) está **Ready**.
- **Tests**: `npm test` → 192 verdes. `npm run typecheck` ✅. `npm run build` ✅. `npm run lint` sin warnings nuevos.

---

## 3. Cómo verificar la feature (humo, como comercial en prod)

1. `/panel/plantillas` → renombrar una plantilla y/o editar su cuerpo → "Guardar plantillas" → recargar: persiste. "Restablecer a la original" revierte. Guardar un cuerpo sin `{url}` → error claro.
2. `/clientes` → crear cliente (o "Ver enlace" en una fila) → aparecen **3 pestañas con los nombres personalizados**; cambiar entre ellas reescribe el mensaje ya con nombre de cliente + URL.
3. Probar deep-links WhatsApp / Email / SMS con la pestaña activa.
4. `/panel` en **desktop**: el callout del objetivo va contenido bajo el "0 / 5" sin superponerse. En **mobile**: ancho completo.
5. `/panel/enlace` sigue con UNA sola plantilla (correcto) + card "Mis plantillas de mensaje".

---

## 4. Watch-outs / gotchas al retomar

- ⚠️ **Email de commit para Vercel**: usar **`alejandro.castillo@inseryal.es`** (config del repo, ya correcta). NO sobreescribir con ningún gmail al commitear — Vercel bloquea el deploy ("commit email could not be matched to a GitHub account"). Si pasa: `git commit --amend --reset-author --no-edit` + `git push --force-with-lease origin main`.
- **Migraciones**: las aplica el usuario a mano en Supabase → SQL Editor (gate del workflow = typecheck + tests). Antes de pushear código que lea una columna nueva, confirmar que la migración está aplicada (si no, rompe prod).
- **Director productor**: la feature de plantillas es solo del rol `sales`. El director no tiene `/clientes` ni `/panel/plantillas` (usa layout admin/manager). La columna serviría en el futuro pero no hay editor.
- **Clases `m-*`**: usan `!important` y solo aplican en ≤767px. Si tocas el callout del objetivo, recuerda la dupla `maxWidth: 240` inline + `m-callout-wide` (§4.32). No quitar el `maxWidth` inline.

---

## 5. Pendientes mayores del proyecto (contexto, no de esta sesión)

- **Google Business Profile API** (caso `5-5855000041022`): checklist completo en **CLAUDE.md §4.26** (16 items). Mientras tanto, Places API trae reseñas.
- **Backlog v2**: CLAUDE.md §8 (ajustes globales `/ajustes`, encriptar `oauth_refresh_token`, retención, etc.).

---

## 6. Comandos

```bash
npm run dev          # dev en localhost:3000 (Turbopack)
npm run typecheck    # gate antes de cerrar tarea
npm test             # Vitest (192 verdes)
npm run build        # build producción
npm run lint         # next lint
```
