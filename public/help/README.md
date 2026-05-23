# Capturas del Centro de Ayuda

Las imágenes de esta carpeta se muestran en la página `/ayuda` (manual del comercial). Mientras no existan, el componente `<HelpFigure />` pinta un placeholder gris con el nombre del archivo esperado, así que la página funciona igualmente — solo verás "Captura pendiente" donde aún no hayas subido el png.

## Lista de capturas a generar

Hacer cada captura desde producción (https://resenas.marinadorconstrucciones.com) **logueado como el comercial de prueba** o cualquier comercial. Resolución mínima recomendada: **1400×900 px**. Formato **PNG**. Sin compresión agresiva — son ilustrativas.

| Archivo | Qué tiene que mostrar |
|---|---|
| `01-email-magic-link.png` | Captura del email de invitación de Brevo con el botón "Acceder a ReseñaHub". Puedes capturar el preview del email desde Gmail o Outlook. |
| `02-panel-sales.png` | El panel del comercial (`/panel`) con sus KPIs visibles (visitas, reseñas del mes, % objetivo, ring de progreso). |
| `03-clientes-lista.png` | Pantalla `/clientes` con varios clientes ya dados de alta y el botón "+ Nuevo cliente" arriba a la derecha visible. |
| `04-cliente-detalle-share.png` | Pantalla `/clientes/{slug}` con la URL personalizada, el QR y los tres botones (WhatsApp / Email / SMS) bien visibles. |
| `05-qr-modal.png` | El modal del QR ampliado tras pulsar "Ver QR". |
| `06-flujo-atribucion.png` | Diagrama del flujo: cliente abre enlace → escribe reseña en Google → cron → matcher → panel + email. Esta SÍ es ilustrativa, puedes hacerla en Figma/Canva con flechas y cajas. |
| `07-mis-resenas.png` | Listado de `/panel/resenas` con 2-3 reseñas de ejemplo, mostrando autor, estrellas, texto y fecha. |
| `08-boton-sincronizar.png` | Detalle del topbar de `/panel` mostrando el botón "Buscar mis reseñas" arriba a la derecha. Recorte zoom suficiente para que se vea bien. |
| `09-perfil.png` | Pantalla `/perfil` con la foto del comercial, datos y el botón "Cerrar sesión". |

## Cómo añadir / actualizar una captura

1. Genera la imagen con la resolución y nombre exacto de la tabla.
2. Súbela a `public/help/` (esta misma carpeta).
3. Commit + push. Vercel la sirve estática automáticamente.
4. En la página `/ayuda` el placeholder se sustituye por la imagen real al recargar.

## Sustituir o quitar un placeholder específico

Editar `app/(profile)/ayuda/page.tsx` y modificar el `src` del `<HelpFigure />` correspondiente, o eliminar el bloque entero si quieres quitar esa figura.

## Si quieres comprimir antes de subir

[Squoosh](https://squoosh.app) o [TinyPNG](https://tinypng.com). Bajar las PNG a ~150-300 KB cada una sin perder legibilidad.
