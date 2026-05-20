# Gestor de reseñas comercial

_Started 2026-05-20 11:18 UTC_

---

## User

Quiero que diseñes una aplicación web para gestionar las reseñas que envían los clientes de cada comercial. Cada comercial tendrá una ficha y un enlace particular que compartirá con sus clientes. Ese enlace llevará al cliente a la ficha de Google Business Profile y la aplicación tiene que comprobar que el cliente ha dejado la reseña. Posteriormente se le contabilizará a ese comercial en el dashboard general y en su ficha por particular. Quiero que utilices un estilo minimalista con grises como Apple. ¿Qué dudas tienes?

## Assistant

_[tool: questions_v2]_

## User

Questions answered:
- audience: Dashboard del administrador (visión global), Ficha individual del comercial (perfil + métricas), Vista del comercial (lo que él mismo ve al entrar), Pantalla de verificación / confirmación de reseña
- company_context: Es una empresa de venta de apartamentos. Por lo tanto los clientes vienen y visitan el piso piloto, reciben toda la información del comercial.
- branding: Sí, lo aporto luego (uso placeholder)
- key_metrics: Total de reseñas por comercial, Ratio enlaces enviados / reseñas conseguidas (conversión), Valoración media en estrellas, Evolución temporal (gráfica), Ranking / leaderboard de comerciales, Reseñas pendientes de verificar, Objetivos vs. conseguido, Comentarios recientes
- verification_flow: Automática silenciosa: el sistema lo detecta vía Google y aparece sin más
- salesperson_fields: Nombre y cargo, Email / teléfono, Sucursal o zona, Equipo / departamento, Enlace personal copiable + QR, Histórico de reseñas con texto y estrellas, Objetivos mensuales, Foto
- time_filters: Hoy / semana / mes / año + rango personalizado
- extras: Notificaciones cuando llega una reseña, Sistema de objetivos / metas, Recompensas o gamificación (badges), Exportar a CSV / informe, Gestión de comerciales (alta/baja/editar), Multi-sucursal con cambio de Google Business Profile
- client_landing_tone: el cliente no ve nunca esa landing ers para uso interno. 
- device_priority: Desktop el dashboard, móvil la landing del cliente (mixto)
- variations: Solo una bien pulida
- novelty: Muy Apple, sobrio y silencioso

## Assistant

_[tool: update_todos]_

_[tool: copy_starter_component]_

Perfecto, todo claro. Empiezo con la estructura y voy enseñándotelo en cuanto haya algo que ver.

**Sistema visual** que voy a usar (lo declaro para no irme):
- Fondo `#F5F5F7`, tarjetas blancas con bordes hairline `#D2D2D7`
- Texto `#1D1D1F` / secundario `#6E6E73` / terciario `#86868B`
- Tipografía `-apple-system` (SF Pro) con `Inter` como fallback
- Sin color de acento saturado: solo escala de grises + un verde discreto para "verificado"
- Cuatro artboards en un canvas: Dashboard admin · Ficha individual · Vista del comercial · Pantalla de verificación

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Listo. Te dejo abierto **ReseñaHub.html** con las 4 pantallas en un canvas (puedes arrastrarlas, abrirlas en pantalla completa o cambiar el orden):

1. **Dashboard general** — KPIs, evolución temporal, leaderboard, reseñas recientes, desglose por sucursal.
2. **Ficha del comercial** — perfil completo, enlace + QR, gráfico mensual, histórico de reseñas, objetivo y logros.
3. **Vista del comercial** — su propio panel: progreso del mes, enlace destacado, ranking y badges.
4. **Verificación silenciosa** — motor de auto-detección con pipeline, cola en vivo y evidencias del cruce.

Todo en escala de grises (verde discreto solo para "verificado"), tipografía SF/Inter, tarjetas blancas con bordes hairline.

**Siguiente paso sugerido**: ¿quieres que profundice en alguna pantalla (p. ej. "Gestión de comerciales" con alta/baja/editar o el detalle de "Sucursales"), o que añadamos Tweaks para tema claro/oscuro y densidad?He terminado. Avísame por dónde sigues.

