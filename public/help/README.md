# Capturas del Centro de Ayuda

Las imágenes de esta carpeta se muestran en la página `/ayuda` (manual del comercial). Mientras no existan, el componente `<HelpFigure />` pinta un placeholder gris con el nombre del archivo esperado, así que la página funciona igualmente — solo verás "Captura pendiente" donde aún no hayas subido el png.

## Lista de capturas a generar

Hacer cada captura desde producción (https://resenas.marinadorconstrucciones.com) **logueado como el comercial de prueba** o cualquier comercial. Resolución mínima recomendada: **1400×900 px**. Formato **PNG**. Sin compresión agresiva — son ilustrativas.

> ⚠️ **Capturas DESFASADAS tras la reescritura de v2** (junio 2026): `02-panel-sales` (mostraba el panel viejo con "visitas") y `08-boton-sincronizar` (mostraba el botón viejo "Buscar mis reseñas") hay que **regenerarlas**. Las marcadas como NUEVAS no existen aún → salen como placeholder hasta que se suban.

| Archivo | Estado | Qué tiene que mostrar |
|---|---|---|
| `01-email-magic-link.png` | OK | Email de invitación de Brevo con el botón "Acceder a ReseñaHub". Puedes capturar el preview desde Gmail/Outlook. |
| `10-menu-movil-tabbar.png` | NUEVA | La barra de pestañas inferior en móvil (≤767px): Panel · Enlace · Reseñas · Ranking. Captura con el navegador en modo móvil. |
| `11-menu-escritorio-sidebar.png` | NUEVA | El menú lateral izquierdo del comercial en escritorio (Mi panel, Mi enlace, Mis clientes, Mis reseñas, Verificación + avatar/Ayuda abajo). |
| `02-panel-sales.png` | REGENERAR | El panel v2 (`/panel`): número grande de reseñas **abonables**, comisión estimada (€), "Por verificar", "Cierra el {día}", ring de objetivo. **Sin "visitas".** |
| `12-periodo-comision.png` | NUEVA | Recorte del panel/topbar mostrando el periodo de comisión activo y el "Cierra el {día}" (o el selector con el atajo "Periodo de comisión"). |
| `07-mis-resenas.png` | REGENERAR | `/panel/resenas`: arriba los KPIs (Abonables / Por verificar / Valoración media / Periodo) y abajo la lista con las etiquetas de estado (Contada / Por verificar / Duplicada). |
| `03-clientes-lista.png` | OK (verificar) | `/clientes` con clientes dados de alta y, en cada fila, los botones "Ver enlace", "Buscar reseñas" y "Eliminar". Regenerar si no se ven los tres. |
| `04-cliente-detalle-share.png` | OK | `/clientes/{slug}` con la URL personalizada, el QR y los botones WhatsApp / Email / SMS. |
| `05-qr-modal.png` | OK | `/panel/enlace`: URL del comercial, QR descargable, plantilla y botones de compartir. |
| `15-editor-plantillas.png` | NUEVA | `/panel/plantillas` (solo escritorio): editor de las 3 plantillas con nombre + texto + comodines `{nombre_cliente}` `{nombre_comercial}` `{url}`. |
| `06-flujo-atribucion.png` | OK | Diagrama del flujo: cliente abre enlace → reseña en Google → sincronización → atribución (por nombre o por mención del comercial) → panel + email. Ilustrativo (Figma/Canva). |
| `08-boton-sincronizar.png` | REGENERAR | Recorte del topbar de **`/panel/resenas`** mostrando el botón **"Sincronizar ahora"** (ya NO está en `/panel` ni se llama "Buscar mis reseñas"). |
| `16-reclamar-huerfana.png` | NUEVA | `/resenas/verificacion` con la vista del comercial ("Reseñas huérfanas de tu ficha") y el botón "Es mía" en una reseña. |
| `17-ranking.png` | NUEVA | `/panel/ranking`: las tarjetas del equipo con la del propio comercial destacada ("Tú"). |
| `09-perfil.png` | OK | `/perfil` con la foto del comercial y el botón "Cerrar sesión". |

## Cómo añadir / actualizar una captura

1. Genera la imagen con la resolución y nombre exacto de la tabla.
2. Súbela a `public/help/` (esta misma carpeta).
3. Commit + push. Vercel la sirve estática automáticamente.
4. En la página `/ayuda` el placeholder se sustituye por la imagen real al recargar.

## Sustituir o quitar un placeholder específico

Editar `app/(profile)/ayuda/page.tsx` y modificar el `src` del `<HelpFigure />` correspondiente, o eliminar el bloque entero si quieres quitar esa figura.

## Si quieres comprimir antes de subir

[Squoosh](https://squoosh.app) o [TinyPNG](https://tinypng.com). Bajar las PNG a ~150-300 KB cada una sin perder legibilidad.
