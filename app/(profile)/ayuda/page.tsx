import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { HelpFigure } from "@/components/help/HelpFigure";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";

export const metadata = { title: "Ayuda · ReseñaHub" };

/**
 * Centro de ayuda — manual completo del comercial, accesible a los cuatro
 * roles desde el sidebar (abajo del todo). Pensado para gente NO técnica:
 * lenguaje muy simple, frases cortas, pasos numerados, ejemplos y capturas.
 *
 * Cubre las funcionalidades de v2 (periodo de comisión, plantillas, reclamar
 * huérfanas, ranking, Excel…) además del flujo básico de v1.
 *
 * Las capturas viven en `public/help/`. Si una imagen no existe todavía,
 * <HelpFigure /> pinta un placeholder con el nombre del fichero esperado para
 * que el equipo lo cubra a posteriori (ver public/help/README.md).
 */
export default async function AyudaPage() {
  const brand = await getCurrentUserBrand();
  return (
    <>
      <Topbar
        title="Ayuda"
        subtitle="Tu manual de ReseñaHub, paso a paso"
        breadcrumb={getBrandBreadcrumb(brand)}
        range={null}
      />

      <div
        className="ayuda-grid"
        style={{
          flex: 1,
          padding: "24px 32px 64px",
          overflow: "auto",
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 32,
          maxWidth: 1200,
        }}
      >
        {/* Tabla de contenidos — sticky a la izquierda en desktop,
            bloque normal arriba en mobile (sin position:sticky). */}
        <aside
          className="ayuda-toc"
          style={{
            position: "sticky",
            top: 24,
            alignSelf: "flex-start",
            height: "fit-content",
          }}
        >
          <nav
            style={{
              padding: "16px 18px",
              border: "1px solid var(--line)",
              borderRadius: 12,
              background: "var(--surface)",
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--ink-4)",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Secciones
            </div>
            <TocLink id="bienvenida" label="1. Bienvenida" />
            <TocLink id="login" label="2. Entrar por primera vez" />
            <TocLink id="mapa" label="3. Cómo te mueves por la app" />
            <TocLink id="panel" label="4. Tu panel de un vistazo" />
            <TocLink id="periodo" label="5. Tu periodo de comisión" />
            <TocLink id="comision" label="6. Qué cuenta para cobrar" />
            <TocLink id="cliente" label="7. Dar de alta un cliente" />
            <TocLink id="enlace" label="8. Compartir tu enlace" />
            <TocLink id="plantillas" label="9. Tus plantillas de mensaje" />
            <TocLink id="atribucion" label="10. Que la reseña sea TUYA" />
            <TocLink id="aparecen" label="11. Cuándo aparecen tus reseñas" />
            <TocLink id="reclamar" label="12. Reclamar reseñas tuyas" />
            <TocLink id="extras" label="13. Ranking, Excel y perfil" />
            <TocLink id="faq" label="14. Dudas y glosario" />
          </nav>
        </aside>

        {/* Contenido */}
        <main style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* 1. Bienvenida */}
          <section id="bienvenida">
            <h2 style={h2Style}>1. Bienvenida a ReseñaHub</h2>
            <p style={pStyle}>
              ReseñaHub es la app interna{" "}
              <strong>del Grupo Marina d&apos;Or</strong> para que cada comercial
              consiga y siga sus reseñas de Google. Sustituye al Excel que se
              llevaba a mano.
            </p>
            <p style={pStyle}>
              La idea es muy sencilla, en tres pasos:
            </p>
            <ol style={olStyle}>
              <li>Tú <strong>compartes un enlace</strong> con tu cliente.</li>
              <li>El cliente <strong>deja la reseña</strong> en Google.</li>
              <li>
                La app <strong>te la apunta a ti</strong> y la verás en tu panel,
                con su valor en comisión. Sin papeleo.
              </li>
            </ol>
            <Callout tone="info">
              <strong>Lo que ves es solo tuyo:</strong> tus números, tu enlace,
              tus clientes, tus reseñas y tu comisión estimada. No ves datos de
              otros comerciales.
            </Callout>
          </section>

          <Divider />

          {/* 2. Login */}
          <section id="login">
            <h2 style={h2Style}>2. Entrar por primera vez</h2>
            <p style={pStyle}>
              Tu administrador te dará de alta con tu email. Recibirás un correo
              de <strong>info@marinadorconstrucciones.com</strong> con un botón{" "}
              <strong>&ldquo;Acceder a ReseñaHub&rdquo;</strong>.
            </p>
            <ol style={olStyle}>
              <li>Abre el correo en tu móvil o tu ordenador.</li>
              <li>
                Pulsa el botón <strong>&ldquo;Acceder a ReseñaHub&rdquo;</strong>.
              </li>
              <li>Te lleva directo a tu panel. Ya estás dentro.</li>
            </ol>
            <HelpFigure
              src="/help/01-email-magic-link.png"
              caption="El email con el botón de acceso. Si no lo ves, mira en la carpeta de Spam."
            />
            <Callout tone="warn">
              <strong>¿No te llega el email?</strong> Mira en Spam. Si tampoco
              está, avisa a tu administrador: tiene un botón para reenviarte el
              acceso.
            </Callout>
            <p style={pStyle}>
              <strong>Las siguientes veces:</strong> entra en{" "}
              <a
                href="https://resenas.marinadorconstrucciones.com"
                style={linkStyle}
              >
                resenas.marinadorconstrucciones.com
              </a>{" "}
              y escribe tu email para pedir un enlace nuevo. Cada enlace dura 1
              hora.
            </p>
          </section>

          <Divider />

          {/* 3. Mapa / navegación */}
          <section id="mapa">
            <h2 style={h2Style}>3. Cómo te mueves por la app</h2>
            <p style={pStyle}>
              Según uses el <strong>móvil</strong> o el{" "}
              <strong>ordenador</strong>, los menús se ven distintos, pero hacen
              lo mismo.
            </p>

            <h3 style={h3Style}>En el móvil</h3>
            <p style={pStyle}>
              Tienes una <strong>barra de pestañas abajo</strong> con lo más
              usado: <strong>Panel</strong>, <strong>Enlace</strong>,{" "}
              <strong>Reseñas</strong> y <strong>Ranking</strong>. Para entrar a{" "}
              <strong>Mis clientes</strong>, pulsa la tarjeta{" "}
              <strong>&ldquo;Ver mis clientes&rdquo;</strong> que verás en el
              Panel.
            </p>
            <HelpFigure
              src="/help/10-menu-movil-tabbar.png"
              caption="En el móvil, la barra de abajo: Panel, Enlace, Reseñas y Ranking."
              maxWidth={300}
            />

            <h3 style={h3Style}>En el ordenador</h3>
            <p style={pStyle}>
              Tienes un <strong>menú a la izquierda</strong> con todo: Mi panel,
              Mi enlace, Mis clientes, Mis reseñas y Verificación. Abajo del
              todo, tu foto te lleva a tu perfil y a la Ayuda.
            </p>
            <HelpFigure
              src="/help/11-menu-escritorio-sidebar.png"
              caption="En el ordenador, el menú de la izquierda con todas las secciones."
              maxWidth={240}
            />
            <Callout tone="info">
              En el móvil tienes lo del día a día. Para tareas más cómodas con
              teclado —como <strong>personalizar tus mensajes</strong>— usa el
              ordenador.
            </Callout>
          </section>

          <Divider />

          {/* 4. Panel */}
          <section id="panel">
            <h2 style={h2Style}>4. Tu panel de un vistazo</h2>
            <p style={pStyle}>
              Es la primera pantalla al entrar. Lo importante es el{" "}
              <strong>número grande</strong>: son tus{" "}
              <strong>reseñas abonables</strong> del periodo (las que cuentan
              para cobrar). Justo al lado verás tu{" "}
              <strong>comisión estimada en euros</strong>.
            </p>
            <HelpFigure
              src="/help/02-panel-sales.png"
              caption="Tu panel: reseñas abonables del periodo, comisión estimada, cuántas faltan para el objetivo y cuándo cierra el periodo."
            />
            <p style={pStyle}>En el panel también ves:</p>
            <ul style={ulStyle}>
              <li>
                <strong>Por verificar</strong> — reseñas que aún no cuentan, pero
                que sumarán cuando se confirmen.
              </li>
              <li>
                <strong>Cierra el día…</strong> — cuándo acaba tu periodo de
                comisión y cuántos días quedan.
              </li>
              <li>
                <strong>Tu objetivo</strong> — el círculo de progreso te dice
                cuánto te falta para tu meta.
              </li>
              <li>
                <strong>Tu evolución, tu puesto en el equipo y tus insignias</strong>{" "}
                — más abajo, para que veas cómo vas.
              </li>
            </ul>
            <Callout tone="info">
              El <strong>número grande</strong> son tus reseñas{" "}
              <strong>abonables</strong>: las verificadas que cuentan para tu
              comisión. Las que están <strong>por verificar</strong> todavía no
              suman.
            </Callout>
          </section>

          <Divider />

          {/* 5. Periodo de comisión */}
          <section id="periodo">
            <h2 style={h2Style}>5. Tu periodo de comisión (del 20 al 19)</h2>
            <p style={pStyle}>
              Tu &ldquo;mes de trabajo&rdquo; para la comisión{" "}
              <strong>no va del 1 al 30</strong>. Va del{" "}
              <strong>día 20 de un mes al día 19 del mes siguiente</strong>. Por
              eso tu panel arranca mostrando ese periodo.
            </p>
            <HelpFigure
              src="/help/12-periodo-comision.png"
              caption="El panel arranca en tu periodo de comisión, del 20 al 19. Verás 'Cierra el {día}'."
            />
            <p style={pStyle}>
              Ejemplo: si hoy es <strong>5 de junio</strong>, tu periodo es del{" "}
              <strong>20 de mayo al 19 de junio</strong>. El día 20 empieza un
              periodo nuevo.
            </p>
            <Callout tone="warn">
              Una reseña que entre el <strong>día 20</strong> ya cuenta para el{" "}
              <strong>periodo siguiente</strong>, no para el que acaba de cerrar.
            </Callout>
            <p style={pStyle}>
              ¿Quieres mirar otro mes? Usa el{" "}
              <strong>selector de fechas</strong> arriba a la derecha: tiene
              atajos para el periodo actual, el anterior y el mes natural.
            </p>
          </section>

          <Divider />

          {/* 6. Qué cuenta para cobrar */}
          <section id="comision">
            <h2 style={h2Style}>6. Qué cuenta para cobrar</h2>
            <p style={pStyle}>
              No todas las reseñas cuentan igual. Hay tres estados que verás con
              una etiqueta de color en <strong>&ldquo;Mis reseñas&rdquo;</strong>:
            </p>
            <HelpFigure
              src="/help/07-mis-resenas.png"
              caption="En 'Mis reseñas': arriba el resumen (abonables, por verificar, valoración) y abajo cada reseña con su etiqueta de estado."
            />
            <ul style={ulStyle}>
              <li>
                <strong>Abonable (verificada)</strong> — verde. Cuenta para tu
                comisión. 👍
              </li>
              <li>
                <strong>Por verificar</strong> — amarillo. La app la detectó pero
                aún falta confirmarla. <strong>Casi siempre acaba contando</strong>;
                cuando se confirma, pasa a abonable.
              </li>
              <li>
                <strong>Duplicada</strong> — etiqueta de aviso. Es una segunda
                reseña del mismo cliente. <strong>Solo cuenta la primera</strong>,
                las demás no se pagan.
              </li>
            </ul>
            <p style={pStyle}>
              Tu comisión estimada se calcula muy fácil:{" "}
              <strong>reseñas abonables × tu tarifa por reseña</strong>.
            </p>
            <Callout tone="warn">
              Cada periodo se paga un <strong>máximo de reseñas bonificables</strong>{" "}
              (te lo indica tu responsable). Si consigues más, ¡genial! — siguen
              sumando a tu producción y a tu ranking, pero la comisión se calcula
              solo hasta ese tope. Tu panel te enseña cuántas van bonificadas.
            </Callout>
            <Callout tone="info">
              El importe en euros es <strong>una estimación</strong> para que te
              orientes. La liquidación final la hace tu empresa.
            </Callout>
            <Callout tone="warn">
              No le pidas <strong>varias reseñas al mismo cliente</strong> (ni a
              su familia con el mismo enlace): solo cuenta una. Mejor un cliente
              nuevo, una reseña nueva.
            </Callout>
          </section>

          <Divider />

          {/* 7. Cliente */}
          <section id="cliente">
            <h2 style={h2Style}>7. Dar de alta un cliente</h2>
            <p style={pStyle}>
              Cuando termines con un cliente que crees que te dejará buena
              reseña, dale de alta. Así la app sabrá que esa reseña es tuya
              cuando llegue.
            </p>
            <p style={pStyle}>
              En <strong>&ldquo;Mis clientes&rdquo;</strong>, pulsa{" "}
              <strong>&ldquo;+ Nuevo cliente&rdquo;</strong> (arriba a la
              derecha).
            </p>
            <HelpFigure
              src="/help/03-clientes-lista.png"
              caption="Tus clientes. En cada uno tienes 'Ver enlace', 'Buscar reseñas' y 'Eliminar'."
            />
            <ol style={olStyle}>
              <li>Pulsa <strong>&ldquo;+ Nuevo cliente&rdquo;</strong>.</li>
              <li>
                Escribe su <strong>nombre completo</strong>, igual que lo pondrá
                en Google.
              </li>
              <li>
                Si los tienes, añade <strong>teléfono y email</strong> (no son
                obligatorios, pero ayudan a enviarle el enlace).
              </li>
              <li>Pulsa <strong>&ldquo;Crear y ver enlace&rdquo;</strong>.</li>
            </ol>
            <Callout tone="warn">
              <strong>El nombre importa.</strong> Ponlo lo más parecido posible
              al que usa en Google. Si la clienta es &ldquo;María del Carmen
              Pérez&rdquo; pero en Google firma como &ldquo;Mari P.&rdquo;, a la
              app le costará más reconocerla.
            </Callout>
            <Callout tone="info">
              <strong>Truco:</strong> si el cliente ya había dejado su reseña
              antes de que lo dieras de alta, al crearlo la app la engancha sola
              cuando el nombre coincide. Si tiene dudas, te enseña una ventanita
              para que confirmes tú.
            </Callout>
          </section>

          <Divider />

          {/* 8. Compartir enlace */}
          <section id="enlace">
            <h2 style={h2Style}>8. Compartir tu enlace</h2>
            <p style={pStyle}>
              Al crear el cliente, la app le genera una{" "}
              <strong>URL solo para él</strong>. Al abrirla, cae directo en la
              pantalla de Google para escribir la reseña.
            </p>
            <HelpFigure
              src="/help/04-cliente-detalle-share.png"
              caption="Ficha del cliente con su URL, su QR y los botones de WhatsApp, Email y SMS."
            />

            <h3 style={h3Style}>Tres formas de enviarlo</h3>
            <ul style={ulStyle}>
              <li>
                <strong>📱 WhatsApp</strong> — lo más rápido. Se abre WhatsApp
                con el mensaje ya escrito. Eliges al cliente y envías.
              </li>
              <li>
                <strong>✉️ Email</strong> — se abre tu correo con el mensaje
                listo (si guardaste su email).
              </li>
              <li>
                <strong>📷 SMS</strong> — se abre el SMS con el mensaje (si
                guardaste su teléfono).
              </li>
            </ul>
            <Callout tone="info">
              Puedes <strong>retocar el mensaje</strong> antes de enviarlo, pero{" "}
              <strong>no borres el enlace</strong>: es lo único imprescindible.
            </Callout>

            <h3 style={h3Style}>Enlace personalizado vs. enlace genérico</h3>
            <p style={pStyle}>
              Además del enlace de cada cliente, en{" "}
              <strong>&ldquo;Mi enlace&rdquo;</strong> tienes tu{" "}
              <strong>enlace genérico</strong> y su QR: el &ldquo;para
              todos&rdquo;. Imprímelo y ponlo en el mostrador, una tarjeta o un
              display.
            </p>
            <HelpFigure
              src="/help/05-qr-modal.png"
              caption="'Mi enlace': tu URL genérica, el QR para descargar e imprimir, y la plantilla de mensaje."
            />
            <Callout tone="warn">
              El enlace <strong>personalizado</strong> (con el nombre del
              cliente) atribuye <strong>mucho mejor</strong> que el genérico.
              Siempre que puedas, da de alta al cliente y usa el suyo.
            </Callout>
            <Callout tone="warn">
              <strong>Qué NO hacer:</strong> mandar el enlace a lo loco en grupos
              o redes. Google penaliza las reseñas que llegan en oleadas raras.
              Una a una, con clientes de verdad.
            </Callout>
          </section>

          <Divider />

          {/* 9. Plantillas */}
          <section id="plantillas">
            <h2 style={h2Style}>9. Tus plantillas de mensaje</h2>
            <p style={pStyle}>
              Al compartir el enlace de un cliente puedes elegir entre{" "}
              <strong>tres mensajes</strong> según el momento:
            </p>
            <ul style={ulStyle}>
              <li>
                <strong>Recién atendido</strong> — para el cliente que acabas de
                atender.
              </li>
              <li>
                <strong>Reavivar visita</strong> — para uno que pasó hace tiempo.
              </li>
              <li>
                <strong>Breve y cercana</strong> — un mensaje cortito e informal.
              </li>
            </ul>
            <p style={pStyle}>
              Y puedes <strong>reescribirlas a tu manera</strong> (desde el
              ordenador). Entra en <strong>&ldquo;Mi enlace&rdquo;</strong> y
              pulsa <strong>&ldquo;Mis plantillas&rdquo;</strong>.
            </p>
            <HelpFigure
              src="/help/15-editor-plantillas.png"
              caption="Editor de plantillas: cambia el nombre y el texto de cada una a tu forma de hablar."
            />
            <p style={pStyle}>
              En el texto verás unos <strong>comodines entre llaves</strong> que
              se rellenan solos al enviar:
            </p>
            <ul style={ulStyle}>
              <li>
                <strong>{"{nombre_cliente}"}</strong> → el nombre del cliente.
              </li>
              <li>
                <strong>{"{nombre_comercial}"}</strong> → tu nombre.
              </li>
              <li>
                <strong>{"{url}"}</strong> → el enlace de la reseña.
              </li>
            </ul>
            <Callout tone="warn">
              Puedes cambiar todo el texto, pero <strong>no borres{" "}
              {"{url}"}</strong>: sin él, el cliente no recibe el enlace para
              dejar la reseña.
            </Callout>
            <Callout tone="info">
              <strong>Editar plantillas es solo de ordenador.</strong> En el
              móvil sí puedes elegir cuál de las tres usar al compartir.
            </Callout>
          </section>

          <Divider />

          {/* 10. Atribución (sección estrella) */}
          <section id="atribucion">
            <h2 style={h2Style}>10. El secreto: que la reseña sea TUYA</h2>
            <p style={pStyle}>
              La app es muy lista, pero a veces le cuesta saber de quién es una
              reseña (Google no nos dice el nombre exacto del cliente). Tú puedes
              ayudar muchísimo con <strong>dos cosas sencillas</strong>:
            </p>
            <Callout tone="info">
              <strong>Regla 1:</strong> usa el <strong>enlace personalizado</strong>{" "}
              del cliente (no el genérico).
              <br />
              <strong>Regla 2:</strong> consigue que el cliente{" "}
              <strong>escriba tu nombre</strong> en la reseña (&ldquo;me atendió{" "}
              <em>Juan</em>, genial&rdquo;). Si te nombra, la app te la apunta
              casi seguro.
            </Callout>
            <HelpFigure
              src="/help/06-flujo-atribucion.png"
              caption="El cliente abre tu enlace → escribe la reseña en Google → la app la trae y te la atribuye (por tu nombre o por el del cliente)."
            />
            <p style={pStyle}>
              Por eso las plantillas están escritas para que se note quién eres.
              Si además el nombre del cliente se parece al que registraste,{" "}
              <strong>mejor todavía</strong>.
            </p>
            <p style={pStyle}>
              ¿Y si aun así una reseña tuya no aparece a tu nombre? Tranquilo: la
              puedes <strong>reclamar</strong> tú mismo (lo vemos en el punto 12).
            </p>
          </section>

          <Divider />

          {/* 11. Cuándo aparecen */}
          <section id="aparecen">
            <h2 style={h2Style}>11. Cuándo aparecen tus reseñas</h2>
            <p style={pStyle}>
              Cuando el cliente deja la reseña en Google,{" "}
              <strong>no aparece al instante</strong>. La app revisa Google{" "}
              <strong>sola, varias veces al día</strong> (cada hora, de la mañana
              a la noche). Cuando entra una tuya, recibes un email y la ves en tu
              panel. No tienes que hacer nada.
            </p>
            <p style={pStyle}>
              Si quieres comprobarlo <strong>ahora mismo</strong>, en{" "}
              <strong>&ldquo;Mis reseñas&rdquo;</strong> tienes el botón{" "}
              <strong>&ldquo;Sincronizar ahora&rdquo;</strong>: trae al momento
              lo último de Google.
            </p>
            <HelpFigure
              src="/help/08-boton-sincronizar.png"
              caption="El botón 'Sincronizar ahora' en 'Mis reseñas'. Te dice cuántas reseñas nuevas ha encontrado."
            />
            <Callout tone="info">
              <strong>¿Por qué a veces dice &ldquo;Sin reseñas nuevas&rdquo;?</strong>{" "}
              Porque Google tarda un poco en publicar la reseña (de unos minutos
              a unas horas). Si el cliente la acaba de escribir, espera un rato y
              vuelve a probar.
            </Callout>
          </section>

          <Divider />

          {/* 12. Reclamar huérfanas */}
          <section id="reclamar">
            <h2 style={h2Style}>12. Reclamar reseñas tuyas</h2>
            <p style={pStyle}>
              A veces un cliente deja la reseña sin pasar por tu enlace, o con un
              nombre raro, y la app no sabe que es tuya. Esas reseñas{" "}
              <strong>&ldquo;sueltas&rdquo;</strong> (las llamamos{" "}
              <strong>huérfanas</strong>) las puedes reclamar tú.
            </p>
            <p style={pStyle}>
              Entra en <strong>&ldquo;Verificación&rdquo;</strong>. Verás las{" "}
              <strong>reseñas huérfanas de tu ficha</strong>. Si reconoces a
              alguien:
            </p>
            <HelpFigure
              src="/help/16-reclamar-huerfana.png"
              caption="En 'Verificación', las reseñas sin dueño de tu ficha. Pulsa 'Es mía' para quedártela."
            />
            <ol style={olStyle}>
              <li>Pulsa <strong>&ldquo;Es mía&rdquo;</strong> en esa reseña.</li>
              <li>
                Elige el <strong>cliente</strong>: uno que ya tengas, uno{" "}
                <strong>nuevo</strong> (lo creas ahí mismo), o{" "}
                <strong>sin cliente</strong> si no lo sabes.
              </li>
              <li>Pulsa <strong>&ldquo;Confirmar reclamación&rdquo;</strong>.</li>
            </ol>
            <p style={pStyle}>
              Listo: esa reseña pasa a ser tuya y aparece en{" "}
              <strong>&ldquo;Mis reseñas&rdquo;</strong>. También tienes, en cada
              cliente, un botón <strong>&ldquo;Buscar reseñas&rdquo;</strong> que
              busca reseñas sueltas que se parezcan a ese nombre.
            </p>
            <Callout tone="warn">
              Reclama <strong>solo lo que de verdad sea tuyo</strong>. Si no
              reconoces al cliente, déjala — tu gestor la repartirá.
            </Callout>
          </section>

          <Divider />

          {/* 13. Ranking, Excel y perfil */}
          <section id="extras">
            <h2 style={h2Style}>13. Ranking, Excel y tu perfil</h2>

            <h3 style={h3Style}>Ranking de tu equipo</h3>
            <p style={pStyle}>
              En <strong>&ldquo;Ranking&rdquo;</strong> ves tu puesto dentro de
              tu equipo, ordenado por reseñas abonables del periodo. Tu tarjeta
              aparece marcada con <strong>&ldquo;Tú&rdquo;</strong>.
            </p>
            <HelpFigure
              src="/help/17-ranking.png"
              caption="El ranking de tu equipo. Tu posición aparece destacada."
            />

            <h3 style={h3Style}>Descargar tu Excel</h3>
            <p style={pStyle}>
              En <strong>&ldquo;Mis reseñas&rdquo;</strong>, el botón{" "}
              <strong>&ldquo;Descargar Excel&rdquo;</strong> te baja un listado
              de tus reseñas del periodo elegido. Útil para revisar tu comisión.
            </p>

            <h3 style={h3Style}>Tu perfil y tu foto</h3>
            <p style={pStyle}>
              Abajo del menú (en el ordenador) está tu avatar. Desde ahí entras a{" "}
              <strong>&ldquo;Mi perfil&rdquo;</strong> para cambiar tu{" "}
              <strong>foto</strong> y para <strong>cerrar sesión</strong> (útil
              en un ordenador compartido).
            </p>
            <HelpFigure
              src="/help/09-perfil.png"
              caption="Tu perfil: cambia tu foto y cierra sesión."
            />
            <Callout tone="warn">
              No puedes cambiar tu <strong>email</strong> ni tu{" "}
              <strong>ficha asignada</strong> desde aquí. Si necesitas un cambio,
              habla con tu administrador.
            </Callout>
          </section>

          <Divider />

          {/* 14. FAQ + Glosario */}
          <section id="faq">
            <h2 style={h2Style}>14. Dudas frecuentes y glosario</h2>

            <FAQ
              question="No me llega el email para entrar"
              answer={
                <>
                  Mira en la carpeta de Spam y en promociones. Si tampoco está,
                  avisa a tu administrador para que use{" "}
                  <strong>&ldquo;Reenviar acceso&rdquo;</strong>.
                </>
              }
            />
            <FAQ
              question="Mi cliente dice que dejó reseña pero no la veo"
              answer={
                <>
                  Tres motivos posibles: <strong>(1)</strong> Google aún no la ha
                  publicado (puede tardar horas); <strong>(2)</strong> usó un
                  nombre muy distinto al que registraste; o <strong>(3)</strong>{" "}
                  la dejó sin pasar por tu enlace. Pulsa{" "}
                  <strong>&ldquo;Sincronizar ahora&rdquo;</strong> en{" "}
                  &ldquo;Mis reseñas&rdquo;. Si sigue sin salir, búscala en{" "}
                  <strong>&ldquo;Verificación&rdquo;</strong> y pulsa{" "}
                  <strong>&ldquo;Es mía&rdquo;</strong> (punto 12).
                </>
              }
            />
            <FAQ
              question="¿Por qué una reseña sale 'Por verificar' y aún no cuenta?"
              answer={
                <>
                  Porque la app la detectó pero quiere una confirmación rápida
                  antes de sumarla. Casi siempre acaba contando: en cuanto se
                  confirma, pasa a <strong>abonable</strong> y se suma a tu
                  comisión.
                </>
              }
            />
            <FAQ
              question="¿Por qué una reseña sale 'Duplicada'?"
              answer="Porque es la segunda (o tercera) reseña del mismo cliente. Para que sea justo, solo cuenta la primera; las demás se marcan como duplicadas y no se pagan."
            />
            <FAQ
              question="¿Por qué mi panel empieza el día 20 y no el 1?"
              answer="Porque tu comisión va por periodos del 20 de un mes al 19 del siguiente, no por mes natural. Puedes mirar otras fechas con el selector de arriba a la derecha."
            />
            <FAQ
              question="No veo mi comisión en euros, solo el número de reseñas"
              answer="Es porque aún no tienes una tarifa por reseña configurada. Pídesela a tu responsable; en cuanto la pongan, verás el importe estimado."
            />
            <FAQ
              question="¿Cómo descargo mis reseñas en Excel?"
              answer={
                <>
                  En <strong>&ldquo;Mis reseñas&rdquo;</strong>, elige el periodo
                  con el selector y pulsa{" "}
                  <strong>&ldquo;Descargar Excel&rdquo;</strong>.
                </>
              }
            />
            <FAQ
              question="¿Dónde cambio el texto de mis mensajes?"
              answer={
                <>
                  Desde el ordenador: entra en{" "}
                  <strong>&ldquo;Mi enlace&rdquo;</strong> y pulsa{" "}
                  <strong>&ldquo;Mis plantillas&rdquo;</strong>. En el móvil solo
                  puedes elegir cuál de las tres usar.
                </>
              }
            />
            <FAQ
              question="¿Qué hago para que se me atribuyan más reseñas?"
              answer={
                <>
                  Dos cosas: usa siempre el <strong>enlace personalizado</strong>{" "}
                  del cliente y procura que el cliente{" "}
                  <strong>escriba tu nombre</strong> en la reseña. Es lo que más
                  ayuda a la app a saber que es tuya (punto 10).
                </>
              }
            />
            <FAQ
              question="¿Y si el cliente no tiene Google?"
              answer="Para dejar reseña necesita una cuenta de Google. Casi todo el mundo tiene una (con su Gmail o su móvil Android). Si te dice que no, puede crear una gratis en 2 minutos, o pasas al siguiente cliente."
            />
            <FAQ
              question="¿Qué pasa si un cliente deja una reseña negativa?"
              answer="Entra igual y se te atribuye; no la oculta nadie. Tu administrador recibe un aviso y entre todos se trabaja la respuesta. Una mala reseña bien contestada en Google no es el fin del mundo."
            />
            <FAQ
              question="¿La app funciona en el móvil?"
              answer={
                <>
                  Sí. Tienes una barra de pestañas abajo: Panel, Enlace, Reseñas
                  y Ranking. &ldquo;Mis clientes&rdquo; se abre desde una tarjeta
                  del Panel, y editar plantillas es solo de ordenador.
                </>
              }
            />

            <h3 style={h3Style}>Glosario rápido</h3>
            <Term word="Abonable (verificada)">
              reseña que cuenta para tu comisión.
            </Term>
            <Term word="Por verificar">
              reseña detectada que aún no suma; al confirmarse pasa a abonable.
            </Term>
            <Term word="Duplicada">
              segunda reseña del mismo cliente; no se paga (solo la primera).
            </Term>
            <Term word="Huérfana (sin atribuir)">
              reseña real que la app no supo de quién era; puedes reclamarla.
            </Term>
            <Term word="Periodo de comisión">
              tu &ldquo;mes de trabajo&rdquo;, del día 20 al 19 del mes siguiente.
            </Term>
            <Term word="Atribución">
              cuando la app decide que una reseña es tuya.
            </Term>
            <Term word="Enlace personalizado">
              el que lleva el nombre de un cliente concreto (atribuye mejor).
            </Term>
            <Term word="Enlace genérico">
              tu enlace &ldquo;para todos&rdquo; (el del QR del mostrador).
            </Term>
            <Term word="Tarifa">
              lo que cobras por cada reseña abonable; la fija tu responsable.
            </Term>
            <Term word="Sincronizar">
              traer ahora mismo de Google tus últimas reseñas.
            </Term>

            <Card>
              <div
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--ink-2)",
                }}
              >
                <strong>¿Otra duda?</strong> Habla con tu administrador o con el
                gestor de reseñas. Estamos para ayudarte.
              </div>
            </Card>
          </section>
        </main>
      </div>
    </>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function TocLink({ id, label }: { id: string; label: string }) {
  return (
    <a
      href={`#${id}`}
      style={{
        display: "block",
        color: "var(--ink-2)",
        textDecoration: "none",
        padding: "2px 0",
      }}
    >
      {label}
    </a>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--line)",
        margin: "8px 0",
      }}
    />
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "info" | "warn";
  children: React.ReactNode;
}) {
  const bg = tone === "warn" ? "var(--warn-bg, rgba(255,170,0,0.08))" : "var(--surface-2)";
  const border =
    tone === "warn" ? "1px solid var(--warn, #b35900)" : "1px solid var(--line)";
  return (
    <div
      style={{
        margin: "16px 0",
        padding: "12px 16px",
        background: bg,
        border,
        borderRadius: 10,
        fontSize: 13.5,
        lineHeight: 1.65,
        color: "var(--ink-2)",
      }}
    >
      {children}
    </div>
  );
}

function FAQ({
  question,
  answer,
}: {
  question: string;
  answer: React.ReactNode;
}) {
  return (
    <details
      style={{
        marginBottom: 10,
        padding: "12px 16px",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: "-0.005em",
          color: "var(--ink)",
        }}
      >
        {question}
      </summary>
      <div
        style={{
          marginTop: 10,
          fontSize: 13.5,
          lineHeight: 1.65,
          color: "var(--ink-2)",
        }}
      >
        {answer}
      </div>
    </details>
  );
}

function Term({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 8px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)" }}>
      <strong style={{ color: "var(--ink)" }}>{word}</strong> — {children}
    </p>
  );
}

// ─── Estilos compartidos ───────────────────────────────────────────────────

const h2Style: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 26,
  fontWeight: 600,
  letterSpacing: "-0.025em",
  marginTop: 0,
  marginBottom: 16,
};

const h3Style: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  letterSpacing: "-0.015em",
  marginTop: 22,
  marginBottom: 10,
};

const pStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  lineHeight: 1.7,
  color: "var(--ink-2)",
};

const olStyle: React.CSSProperties = {
  margin: "0 0 12px 0",
  paddingLeft: 24,
  fontSize: 14,
  lineHeight: 1.85,
  color: "var(--ink-2)",
};

const ulStyle: React.CSSProperties = {
  margin: "0 0 12px 0",
  paddingLeft: 24,
  fontSize: 14,
  lineHeight: 1.85,
  color: "var(--ink-2)",
};

const linkStyle: React.CSSProperties = {
  color: "var(--ink)",
  fontWeight: 500,
};
