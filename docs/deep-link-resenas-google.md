# Deep-link a la reseña concreta de Google Maps — informe técnico

> **Para quién es este documento:** un desarrollador fullstack externo al
> proyecto, para que dé su opinión sobre el enfoque y, sobre todo, sobre el
> muro técnico que encontramos al final. Está escrito para que se entienda
> **sin conocer el código del proyecto**. Fecha: 2026-06-11.

---

## 0. TL;DR (resumen en 30 segundos)

- **Objetivo:** que cada reseña de Google que mostramos en nuestra plataforma
  enlace **directamente a esa reseña concreta** en Google Maps (no a la lista
  de reseñas del negocio).
- **Lo difícil resultó NO ser construir la URL.** Conseguimos
  **reverse-engineerear el formato del deep-link y verificarlo en producción**:
  con el token de la reseña + el ID interno del negocio construimos la URL
  exacta y abre la reseña correcta. ✅
- **Lo que NO conseguimos automatizar es OBTENER ese token a escala.** Google
  Maps sirve a **cualquier navegador automatizado (Playwright)** una versión
  recortada de la ficha **sin las reseñas individuales**. El único entorno
  donde sí aparecen fue un Chrome real "de verdad" al que nos adjuntamos. Eso
  no es reproducible en CI ni en un script desatendido.
- **Estado:** toda la infraestructura está construida y desplegada de forma que
  **no rompe nada** (si una reseña no tiene deep-link, el enlace cae a la lista,
  como antes). Solo falta una fuente fiable de tokens.
- **La pregunta para ti está en la §8.**

---

## 1. Contexto del producto

La plataforma (Next.js 15 + Supabase) gestiona las reseñas de Google de una
empresa con 7 fichas de Google Business Profile. Sincroniza las reseñas vía la
**Google Business Profile API** y las muestra en varias pantallas internas y en
exports de Excel. Junto a cada reseña hay un botón "Ver en Google".

Hoy ese botón lleva a la **lista** de reseñas del negocio
(`https://search.google.com/local/reviews?placeid=XXX`): el usuario tiene que
buscar visualmente la reseña concreta. **Queremos que lleve directo a ella.**

---

## 2. Restricciones de partida (qué nos da Google y qué guardamos)

Por cada reseña, la **Business Profile API** nos devuelve:

```
reviewId · reviewer.displayName · starRating · comment · createTime · updateTime · reviewReply
```

Lo guardamos en una tabla `reviews` (Postgres/Supabase). El identificador es
`google_review_id` (el `reviewId` de la API, p. ej. `AbFvOqm...`).

**Dato clave que condiciona todo:** ese `reviewId` de la API **no aparece en
ninguna URL pública de Google**. No hay endpoint oficial que reciba un
`reviewId` y devuelva la URL de la reseña.

---

## 3. Lo que probamos para obtener la URL (en orden)

### 3.1 APIs oficiales — insuficientes

| Vía | Qué da | Veredicto |
|-----|--------|-----------|
| **Business Profile API** | El set de campos de arriba. **No** incluye ninguna URL por reseña. | ❌ No sirve. |
| **Places API (New)**, campo `googleMapsUri` | Sí devuelve un enlace directo por reseña… pero **solo de ~5 reseñas "destacadas"** que elige Google, y nunca el resto. Re-consultar devuelve las mismas 5. | ❌ Cobertura ~5/ficha de ~230 reseñas. Inservible para cobertura completa. |

Conclusión: **ninguna API oficial resuelve esto.** El enlace por reseña solo
existe en la UI de Google Maps (botón "Compartir reseña" → `maps.app.goo.gl/...`).

### 3.2 Reverse-engineering del deep-link — **ESTO SÍ FUNCIONÓ** ✅

Partimos de un enlace real de "Compartir reseña" que un usuario generó a mano.
Al expandir el `maps.app.goo.gl/...` se obtiene la URL canónica:

```
https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!2m5!1s{TOKEN}!2m1!1s0x0:0x{CID}!3m1!1s2@1:{TOKEN2}
```

Descompusimos cada parte:

1. **`{CID}`** = la segunda mitad del **Feature ID (FID)** del negocio. El FID
   tiene forma `0x<cell>:0x<cid>` (p. ej. `0xd60489fe4101153:0xe9174fc12c1908e8`).
   Es **distinto** del `place_id` estándar (`ChIJ...`) que ya teníamos. El FID
   se extrae del HTML de la página de la ficha (`/maps/place/?q=place_id:XXX`)
   con un regex — verificado: el FID así obtenido coincide con el de los
   enlaces de compartir reales.

2. **`{TOKEN}`** = el token de la reseña. Resulta que **está en el DOM de Maps**:
   cada reseña tiene un `data-review-id` (en el botón "Compartir") cuyo valor
   ES exactamente ese `{TOKEN}`. (No es el `reviewId` de la API; es otro
   identificador, base64.)

3. **`{TOKEN2}`** parecía un tercer secreto… pero **se deriva del propio
   `{TOKEN}`**. Decodificando el base64 del `data-review-id`:

   ```
   bytes = base64decode(TOKEN)  →  0x0a 0x2f <INNER:47 bytes> 0x10 0x01
   (protobuf: campo1 length-delimited = INNER; campo2 varint = 1)
   ```

   Y `TOKEN2 = "2@1:" + INNER + "||"`. Es decir: **con solo `data-review-id` +
   FID se puede construir la URL completa**, sin llamar a ningún sitio.

**Verificación E2E (no teórica):** construimos la URL para una reseña concreta
("Lisset Miguel", 5★, ficha de Oropesa) a partir de su `data-review-id` + el
FID, la abrimos en un navegador y **mostró exactamente esa reseña**. Hay tests
unitarios del builder (`buildMapsReviewUrl(dataReviewId, fid)`).

> En resumen: **dado el token de una reseña, sabemos generar su deep-link de
> forma determinista y fiable.** Ese problema está resuelto.

### 3.3 El problema que quedó: OBTENER el `data-review-id` a escala (automático)

El `data-review-id` vive en el DOM de la página de reseñas de Maps. Para
poblarlo en nuestras ~230 reseñas necesitamos cargar esa página
programáticamente y leer los tokens. Aquí está el muro.

---

## 4. El muro: Google no renderiza las reseñas para navegadores automatizados

Probamos cargar el panel de reseñas con **Playwright** (Chromium) en todas las
configuraciones razonables. **En todas**, Google sirve una versión **reducida**
de la ficha: aparece el resumen de valoraciones (nota media, distribución de
estrellas, botón "Escribir una reseña") pero **NO la pestaña "Reseñas" ni las
tarjetas individuales** (`div[data-review-id]`). La extracción devuelve **0
reseñas**.

| Configuración probada | Pestaña "Reseñas" | Tarjetas de reseña |
|---|---|---|
| Playwright headless (chromium) | ❌ | 0 |
| Playwright headed (chromium, con ventana) | ❌ | 0 |
| Playwright `channel: "chrome"` (Chrome real instalado) | ❌ | 0 |
| + flujo de consentimiento real (clic "Aceptar todo") | ❌ | 0 |
| + `--disable-blink-features=AutomationControlled` + spoof de `navigator.webdriver` | ❌ | 0 |
| `launchPersistentContext` (perfil de Chrome persistente en disco) | ❌ | 0 |
| **Chrome real al que nos ADJUNTAMOS vía CDP** (sesión de DevTools sobre un Chrome ya en marcha) | ✅ **3 pestañas** | ✅ **se leen autor + rating + token** |

La **misma función de extracción** que devuelve 0 en Playwright, en el Chrome
adjuntado devolvió perfectamente `{ author, rating, data-review-id }` de cada
reseña. Es decir: **la lógica de extracción es correcta; lo que cambia es el
entorno del navegador.**

Datos adicionales del diagnóstico:
- **No es bloqueo por IP.** Verificado desde una IP de datacenter (GitHub
  Actions): la página de ficha responde `200`, sin muro de consentimiento, y el
  FID se extrae bien. Lo que no llega son las reseñas individuales.
- **No es el consentimiento** (probamos inyectando cookies de consentimiento y
  también haciendo el clic real).
- **No es `navigator.webdriver`** por sí solo (lo spoofeamos y siguió igual).
- El endpoint interno que Maps usa hoy para las reseñas es un `batchexecute`
  (RPC con payload protobuf, rpcid `T4jwAf`); antes era un GET `listugcposts`
  que ahora responde vacío. Reverse-engineerear ese POST es posible pero frágil
  y no lo intentamos a fondo (ver §7, vía B).

**Hipótesis** (no confirmada del todo): Google sirve el módulo completo de
reseñas solo a navegadores con suficientes señales de "navegador real de un
humano" (perfil con historial/confianza, no lanzado por automation). Un Chrome
recién lanzado por Playwright —aunque sea el binario de Chrome real con perfil
persistente— no las pasa; un Chrome del usuario al que te adjuntas, sí.

---

## 5. Lo que SÍ está construido y desplegado (y no rompe nada)

Decisión de diseño: construir toda la cadena de forma que **funcione el día que
haya tokens, sin regresión mientras no los haya.**

1. **Migración de BD** (aplicada en producción):
   - `reviews.google_maps_url` (el deep-link; `NULL` = aún no resuelto).
   - `reviews.maps_url_matched_at`.
   - `locations.google_fid` (FID cacheado por ficha).
   - Índice parcial sobre `google_maps_url IS NULL` (cola de pendientes).

2. **Degradación transparente** en la capa de presentación. Una función
   `buildGoogleReviewUrl({ mapsUrl, placeId })` devuelve:
   - el **deep-link** si la reseña tiene `google_maps_url`;
   - si no, la **lista** de reseñas de la ficha (comportamiento actual);
   - si no hay ni eso, `null` (no se pinta el enlace).

   Está cableada en las **7 pantallas** que listan reseñas + el Excel + el email
   de alerta. Resultado: **poblar `google_maps_url` por cualquier medio activa
   el deep-link al instante en toda la app, sin tocar más código.** Y mientras
   esté vacío, todo sigue como hoy → **cero regresión**.

3. **Constructor de URL verificado** (`buildMapsReviewUrl`, §3.2) con tests.

4. **Matcher** para casar las reseñas leídas del DOM con nuestras filas de BD:
   por **autor** (similitud de nombres ≥90) + **rating**, con la fecha como
   guarda laxa (el DOM solo da fecha relativa, "hace 8 meses", así que la fecha
   no puede ser estricta). **Solo casa cuando el match es único en ambos
   sentidos** (conservador: preferimos no poner enlace —y caer a la lista— antes
   que arriesgarnos a enlazar a la reseña equivocada). Con tests.

5. **Runner** (`jobs/enrich-review-urls.mjs`): orquesta resolver FID → cargar
   panel → extraer DOM → matchear → escribir (`UPDATE ... WHERE google_maps_url
   IS NULL`, idempotente y race-safe). **Funciona en su lógica, pero la
   extracción devuelve 0 por el muro de la §4**, así que queda como herramienta
   experimental, no cableada a CI.

---

## 6. Por qué nos paramos aquí (y no forzamos)

El plan tenía un criterio explícito: *"si el harvest se bloquea, parar y
replantear; no hay plan B automático completo."* Tras 7 configuraciones de
navegador sin éxito, seguir permutando flags era entrar en un pozo de
mantenimiento frágil. La parte difícil y de valor (construir la URL) está
resuelta y verificada; el cuello de botella es exclusivamente **cosechar los
tokens de forma desatendida**, y ahí Google tiene la sartén por el mango.

---

## 7. Opciones sobre la mesa (para poblar `google_maps_url`)

**A) Pegado manual.** Un campo donde un gestor pega el enlace de "Compartir
reseña" de Google en la reseña que importe → deep-link al instante.
- ✅ Robusto, cero fricción con Google, trivial de construir (el pipeline ya
  está; solo falta el input + una server action).
- ❌ Manual; solo práctico para las reseñas de alto valor, no para las 230.

**B) Reverse-engineering del `batchexecute` (`T4jwAf`) por fetch.** Replicar el
POST interno que Maps usa para las reseñas, sin navegador.
- ✅ Si funciona, es ligero y corre en cualquier sitio (la IP no está bloqueada).
- ❌ Payload protobuf no documentado, muy frágil, y puede requerir tokens XSRF
  de sesión. Alto riesgo de romperse en cada cambio de Google.

**C) `connectOverCDP` a un Chrome real del usuario.** El runner se conecta a un
Chrome que el usuario ya tiene abierto (su perfil), que es el entorno que SÍ
renderiza las reseñas.
- ✅ Automático y completo; reutiliza el único entorno que funcionó.
- ❌ Local (no CI), depende de que el usuario tenga Chrome abierto con su perfil,
  y sigue siendo frágil a cambios de DOM de Google. Sin verificar aún que CDP a
  un Chrome auto-lanzado (no el de DevTools) renderice las reseñas.

**D) Parar.** Dejar la base lista y retomar si el negocio lo pide.

**Nuestra recomendación:** **A** para tener la función usable ya sin fragilidad,
y explorar **C** con calma si se quiere cobertura masiva automática. Evitar **B**
salvo necesidad (deuda de mantenimiento alta).

---

## 8. Lo que te pedimos opinar

1. **¿Hay una vía oficial/soportada que se nos haya escapado** para obtener una
   URL por reseña (alguna API de Google, parámetro de Maps, etc.)?
2. Sobre el **muro de la §4**: ¿coincides en que es anti-automatización por
   "confianza del navegador"? ¿Conoces una forma **fiable y mantenible** de que
   un navegador automatizado/CI reciba el módulo completo de reseñas (¿perfil
   real?, ¿sesión Google?, ¿algún flag?), o lo considerarías una mala idea por
   fragilidad/ToS?
3. ¿Apostarías por **B** (fetch del `batchexecute`) pese a la fragilidad, o lo
   descartarías como hicimos?
4. ¿Te parece sólida la **arquitectura de degradación** (construir todo para que
   no rompa y se "encienda" al poblar un campo), o lo habrías planteado distinto?
5. Sobre el **matcher autor+rating+unicidad** con fecha laxa: ¿lo ves
   suficientemente seguro contra falsos positivos, o reforzarías algo?
6. Cualquier consideración de **ToS de Google / riesgo para las fichas** que
   creas que estamos infravalorando.

---

## Apéndice — punteros al código (por si quieres mirarlo)

- Constructor de URL (verificado) + parsing FID/token: `lib/google/maps-ugc.ts`
  (+ tests en `lib/google/__tests__/maps-ugc.test.ts`).
- Degradación deep-link → lista: `lib/google/review-url.ts`
  (`buildGoogleReviewUrl`).
- Matcher: `lib/google/maps-url-matching.ts` (+ tests).
- Runner experimental: `jobs/enrich-review-urls.mjs`.
- Migración: `supabase/migrations/029_review_maps_url.sql`.
- Notas internas del proyecto: `CLAUDE.md` §4.54.
