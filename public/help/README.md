# Capturas del Centro de Ayuda

Las imágenes de esta carpeta se muestran en la página `/ayuda` (manual del comercial). Mientras no existan, el componente `<HelpFigure />` pinta un placeholder gris con el nombre del archivo esperado, así que la página funciona igualmente — solo verás "Captura pendiente" donde aún no hayas subido el png.

## Lista de capturas a generar

Hacer cada captura desde producción (https://resenas.marinadorconstrucciones.com) **logueado como el comercial de prueba** o cualquier comercial. Resolución mínima recomendada: **1400×900 px**. Formato **PNG**. Sin compresión agresiva — son ilustrativas.

> **Capturas regeneradas para v2 (2026-06-02).** Todas las pantallas se capturaron desde la cuenta del comercial **Cornel Popescu** (autorizado por el admin) en `localhost:3000` con el código de v2, a 1400×900 (la móvil a 390×844), ocultando el indicador de Next.js DevTools. `06-flujo-atribucion` sigue siendo el diagrama ilustrativo de v1.
>
> ✅ **Privacidad (resuelto 2026-06-17, §4.59):** aunque estos PNG viven en `public/`, **ya NO se sirven sin autenticación**. El matcher de [`middleware.ts`](../../middleware.ts) incluye `/help/:path*` y `pathAllowedForRole` permite `/help/*` solo a usuarios autenticados (cualquier rol, igual que `/ayuda`); un anónimo que abra `/help/02-panel-sales.png` es redirigido a `/login`. Por eso pueden contener datos de un comercial real (su comisión estimada, nombres del equipo en el ranking) sin exposición pública. Si aun así prefieres no tener datos reales en el repo, regenerar con una cuenta demo o difuminar.

| Archivo | Qué muestra |
|---|---|
| `01-email-magic-link.png` | Email de invitación de Brevo con el botón "Acceder a ReseñaHub". |
| `10-menu-movil-tabbar.png` | La barra de pestañas inferior en móvil: Panel · Enlace · Reseñas · Ranking. |
| `11-menu-escritorio-sidebar.png` | El menú lateral del comercial en escritorio (Mi panel, Mi enlace, Mis clientes, Mis reseñas, Verificación + Ayuda/avatar abajo). |
| `02-panel-sales.png` | El panel v2 (`/panel`): reseñas **abonables**, comisión estimada (€), "Por verificar", "Cierra el {día}", ring de objetivo, evolución, ranking, insignias. |
| `12-periodo-comision.png` | El selector de fechas abierto en `/panel/resenas` con los atajos de periodo (comisión / anterior / mes natural / mes pasado). |
| `07-mis-resenas.png` | `/panel/resenas`: los KPIs (Abonables / Por verificar / Valoración / Periodo) y la lista con las etiquetas de estado. |
| `03-clientes-lista.png` | `/clientes` con clientes y los botones "Ver enlace", "Buscar reseñas" y "Eliminar" por fila. *(captura de v1)* |
| `04-cliente-detalle-share.png` | `/clientes/{slug}` con la URL personalizada, el QR y los botones WhatsApp / Email / SMS. *(captura de v1)* |
| `05-qr-modal.png` | `/panel/enlace`: URL del comercial, QR descargable, plantilla y botones de compartir. *(captura de v1)* |
| `15-editor-plantillas.png` | `/panel/plantillas` (solo escritorio): editor de las 3 plantillas con nombre + texto + comodines `{nombre_cliente}` `{nombre_comercial}` `{url}`. |
| `06-flujo-atribucion.png` | Diagrama ilustrativo del flujo de atribución. *(diagrama de v1)* |
| `08-boton-sincronizar.png` | El topbar de `/panel/resenas` con el botón **"Sincronizar ahora"**. |
| `16-reclamar-huerfana.png` | `/resenas/verificacion` (vista del comercial): "Reseñas huérfanas de tu ficha" con el botón "Es mía". |
| `17-ranking.png` | `/panel/ranking`: las tarjetas del equipo con la del propio comercial destacada ("Tú"). |
| `09-perfil.png` | `/perfil` con la foto del comercial y el botón "Cerrar sesión". *(captura de v1)* |

## Cómo añadir / actualizar una captura

1. Genera la imagen con la resolución y nombre exacto de la tabla.
2. Súbela a `public/help/` (esta misma carpeta).
3. Commit + push. Vercel la sirve estática automáticamente.
4. En la página `/ayuda` el placeholder se sustituye por la imagen real al recargar.

## Sustituir o quitar un placeholder específico

Editar `app/(profile)/ayuda/page.tsx` y modificar el `src` del `<HelpFigure />` correspondiente, o eliminar el bloque entero si quieres quitar esa figura.

## Si quieres comprimir antes de subir

[Squoosh](https://squoosh.app) o [TinyPNG](https://tinypng.com). Bajar las PNG a ~150-300 KB cada una sin perder legibilidad.
