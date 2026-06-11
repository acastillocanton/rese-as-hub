# Agente de cosecha de deep-links de reseña (§4.54, vía B)

Rellena automáticamente el **enlace directo a cada reseña** (`reviews.google_maps_url`)
cosechando los tokens desde el DOM de Google Maps con un **Chrome real**. Es la
única forma de cubrir TODAS las reseñas: Google no sirve el módulo de reseñas a
un servidor headless ni a un navegador lanzado por automation (verificado). Este
agente lanza el Chrome instalado de forma "limpia" (`--remote-debugging-port`,
sin flags de automation) y se conecta por CDP, que sí pasa el filtro de Google.

Corre en el **PC de oficina** (Windows). **No necesita permisos de administrador.**

## Qué hace en cada ejecución

1. Lee de Supabase las reseñas SIN deep-link (idempotente): procesa **todo el
   backlog acumulado**, da igual cuánto tiempo estuvo el PC apagado → no pierde
   nada (recupera lo de los días que estuvo apagado).
2. Lanza un Chrome dedicado (perfil propio en `agent/.chrome-profile/`, **no toca
   tu navegación normal**) y acepta el muro de cookies una vez (queda guardado).
3. Por ficha: abre Reseñas, ordena "Más recientes", hace scroll y extrae
   `{token, autor, valoración, fecha}` de cada tarjeta + el FID de la URL.
4. Casa con nuestras filas (autor ≥90 + valoración + fecha, solo match único) y
   escribe el deep-link. Las anónimas o muy antiguas se dejan sin enlace (la app
   cae a la lista, sin error). Al terminar **cierra el Chrome que abrió**.

## Requisitos (ya cumplidos en este PC)

- **Node.js** en el PATH (`node -v`). Si faltara: versión portable de nodejs.org
  (zip, sin instalador → sin admin).
- **Google Chrome** instalado (ruta estándar; si está en otra, define
  `CHROME_PATH` en `.env.local`).
- `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

## Uso

- **Modo escucha (recomendado, el que arranca solo):** `agent\watch-harvest.cmd`
  (= `node agent/harvest-maps-urls.mjs --watch`). Hace una pasada inicial y queda
  **escuchando** en segundo plano: cada ~60s mira si un gestor pulsó el botón web
  **"Sincronizar enlaces"** (deja una señal `harvest_requested` en `audit_log`) y,
  si la hay, cosecha al momento; además hace una pasada periódica cada
  `HARVEST_PERIOD_HOURS` (4 por defecto). Si el PC está apagado cuando se pulsa el
  botón, la petición espera y se procesa al encender (recupera el backlog).
- **Una sola pasada (a demanda):** doble clic en `agent\run-harvest.cmd`
  (= `node agent/harvest-maps-urls.mjs`), hace una pasada y termina.
- **Automático al encender:** acceso directo en la carpeta de Inicio de Windows
  que ejecuta `watch-harvest.cmd` al iniciar sesión (sin admin). Para verlo/quitarlo:
  tecla Windows → `shell:startup` → "ReseñaHub - Cosechar enlaces". Para recrearlo,
  ver el comando de abajo (apuntando a `watch-harvest.cmd`).
- **Registro:** la salida se añade a `agent\harvest.log`.

El botón web vive en `/manager/resenas` (lo ven admin + gestor) y llama a
`POST /api/sync/maps-urls`, que solo registra la petición — el trabajo lo hace
ESTE agente. Un solo PC sirve a todos los gestores.

### Recrear el acceso directo de inicio (PowerShell, sin admin)

```powershell
$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'ReseñaHub - Cosechar enlaces.lnk'))
$lnk.TargetPath = 'C:\ruta\al\repo\agent\run-harvest.cmd'
$lnk.WorkingDirectory = 'C:\ruta\al\repo'
$lnk.WindowStyle = 7   # minimizado
$lnk.Save()
```

## Notas

- **Frágil por naturaleza:** si Google cambia el DOM de Maps, la extracción puede
  dejar de casar (el agente registraría 0 casadas, sin romper nada). Entonces hay
  que ajustar los selectores en `harvest-maps-urls.mjs`.
- La lógica de construcción de URL y de matching es espejo de
  `lib/google/maps-ugc.ts` y `lib/google/maps-url-matching.ts` (canónicas).
- Variables opcionales (`.env.local`): `CHROME_PATH`, `CDP_PORT` (9222),
  `HARVEST_PROFILE_DIR`, `ENRICH_MAX_SCROLLS` (18).
