import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { HelpFigure } from "@/components/help/HelpFigure";

export const metadata = { title: "Ayuda · ReseñaHub" };

/**
 * Centro de ayuda — manual completo accesible a los tres roles desde el
 * sidebar (abajo del todo). Pensado para gente no técnica: lenguaje claro,
 * pasos numerados, ejemplos concretos y capturas.
 *
 * Las capturas viven en `public/help/`. Si una imagen no existe todavía,
 * el componente <HelpFigure /> pinta un placeholder con el nombre del
 * fichero esperado para que el equipo lo cubra a posteriori.
 */
export default function AyudaPage() {
  return (
    <>
      <Topbar
        title="Ayuda"
        subtitle="Cómo usar ReseñaHub paso a paso"
        breadcrumb="Inseryal"
        range={null}
      />

      <div
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
        {/* Tabla de contenidos — sticky a la izquierda */}
        <aside
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
            <TocLink id="panel" label="3. Tu panel" />
            <TocLink id="cliente" label="4. Dar de alta un cliente" />
            <TocLink id="enlace" label="5. Compartir el enlace" />
            <TocLink id="atribucion" label="6. Cómo se atribuyen tus reseñas" />
            <TocLink id="resenas" label="7. Ver tus reseñas" />
            <TocLink id="sincronizar" label="8. Sincronizar manualmente" />
            <TocLink id="perfil" label="9. Editar tu perfil" />
            <TocLink id="faq" label="10. Preguntas frecuentes" />
          </nav>
        </aside>

        {/* Contenido */}
        <main style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* 1. Bienvenida */}
          <section id="bienvenida">
            <h2 style={h2Style}>1. Bienvenida a ReseñaHub</h2>
            <p style={pStyle}>
              ReseñaHub es la plataforma interna de{" "}
              <strong>Inseryal by Marina d&apos;Or</strong> donde cada comercial
              gestiona sus reseñas de Google de forma personalizada. Sustituye
              el seguimiento manual en Excel que se hacía hasta ahora.
            </p>
            <p style={pStyle}>
              La idea es muy sencilla: tú compartes un enlace personalizado con
              cada cliente; cuando el cliente deja una reseña en Google, la app
              te la atribuye automáticamente y la verás en tu panel. Sin
              papeleo, sin hojas de cálculo.
            </p>
            <Callout tone="info">
              <strong>Lo que verás como comercial:</strong> tu panel con tus
              números, tu enlace personal, tus clientes, tus reseñas. No ves
              datos de otros comerciales — es privado.
            </Callout>
          </section>

          <Divider />

          {/* 2. Login */}
          <section id="login">
            <h2 style={h2Style}>2. Entrar por primera vez</h2>
            <p style={pStyle}>
              El administrador (Alejandro o Rafael) te dará de alta con tu
              email. Recibirás un correo de <strong>info@marinadorconstrucciones.com</strong>
              {" "}con un botón &ldquo;Acceder a ReseñaHub&rdquo;.
            </p>
            <ol style={olStyle}>
              <li>Abre el correo en tu móvil o tu ordenador.</li>
              <li>Haz clic en el botón <strong>&ldquo;Acceder a ReseñaHub&rdquo;</strong>.</li>
              <li>Te llevará directamente a tu panel. Ya estás dentro.</li>
            </ol>
            <HelpFigure
              src="/help/01-email-magic-link.png"
              caption="Cómo se ve el email con el botón de acceso. Asegúrate de mirar también en la carpeta de Spam si no lo encuentras."
            />
            <Callout tone="warn">
              <strong>¿No te llega el email?</strong> Avisa al administrador.
              Puede que tu email esté mal escrito o que el correo haya ido a
              spam. Tiene un botón para reenviar el acceso si hace falta.
            </Callout>
            <p style={pStyle}>
              <strong>Para sesiones siguientes:</strong> entra en{" "}
              <a
                href="https://resenas.marinadorconstrucciones.com"
                style={linkStyle}
              >
                resenas.marinadorconstrucciones.com
              </a>{" "}
              y pide un nuevo enlace de acceso introduciendo tu email. Cada
              enlace dura 1 hora.
            </p>
          </section>

          <Divider />

          {/* 3. Panel */}
          <section id="panel">
            <h2 style={h2Style}>3. Tu panel</h2>
            <p style={pStyle}>
              La primera pantalla que ves al entrar es tu panel. De un vistazo
              te dice tres cosas:
            </p>
            <HelpFigure
              src="/help/02-panel-sales.png"
              caption="Tu panel con KPIs propios: cuántas visitas a tu enlace, cuántas reseñas atribuidas, cuánto te falta para el objetivo del mes."
            />
            <ul style={ulStyle}>
              <li>
                <strong>Tus reseñas del mes</strong> — número grande arriba a la
                izquierda. Cuantas más, mejor.
              </li>
              <li>
                <strong>Visitas a tu enlace</strong> — cuántas veces algún
                cliente ha abierto tu URL personal. Es la antesala de la reseña.
              </li>
              <li>
                <strong>Objetivo del mes</strong> — el porcentaje sobre la meta
                mensual que te asignó el administrador (por ejemplo: 10 reseñas
                al mes).
              </li>
            </ul>
            <p style={pStyle}>
              Arriba a la derecha tienes el selector de rango temporal: por
              defecto te muestra el mes actual, pero puedes mirar trimestre,
              año, etc.
            </p>
          </section>

          <Divider />

          {/* 4. Cliente */}
          <section id="cliente">
            <h2 style={h2Style}>4. Dar de alta un cliente nuevo</h2>
            <p style={pStyle}>
              Cada vez que termines un servicio con un cliente y crees que va a
              dejarte buena reseña, dale de alta en la app. Esto es lo que
              permite que la app sepa que esa reseña venía de ti cuando llegue.
            </p>
            <p style={pStyle}>
              En el menú izquierdo clica <strong>&ldquo;Mis clientes&rdquo;</strong>.
              Verás la lista de los que ya tienes registrados (vacía al
              principio) y un botón <strong>&ldquo;+ Nuevo cliente&rdquo;</strong>{" "}
              arriba a la derecha.
            </p>
            <HelpFigure
              src="/help/03-clientes-lista.png"
              caption="Lista de tus clientes. El botón '+ Nuevo cliente' está arriba a la derecha."
            />
            <ol style={olStyle}>
              <li>Clica en <strong>&ldquo;+ Nuevo cliente&rdquo;</strong>.</li>
              <li>
                Escribe el <strong>nombre completo del cliente</strong> tal y
                como te lo dijo. Importante: usa el nombre real que vaya a
                aparecer en Google cuando deje la reseña.
              </li>
              <li>
                Opcionalmente, añade <strong>teléfono y email</strong> si los
                tienes. No son obligatorios pero ayudan a contactar.
              </li>
              <li>Pulsa <strong>&ldquo;Crear&rdquo;</strong>.</li>
            </ol>
            <Callout tone="warn">
              <strong>Importante</strong>: el nombre del cliente tiene que
              coincidir lo máximo posible con el que pondrá en Google. Si la
              señora se llama &ldquo;María del Carmen Pérez Ruiz&rdquo; pero
              en Google publica como &ldquo;Mari Pérez&rdquo;, tendremos
              menos confianza en la atribución. Ojo a apodos y abreviaciones.
            </Callout>
          </section>

          <Divider />

          {/* 5. Enlace */}
          <section id="enlace">
            <h2 style={h2Style}>5. Compartir el enlace con el cliente</h2>
            <p style={pStyle}>
              Una vez creado el cliente, la app te genera al instante una URL
              personalizada solo para él/ella, con tu nombre y el suyo. Al
              abrirla, el cliente cae directamente en la pantalla de Google
              para escribir la reseña, sin pasos intermedios.
            </p>
            <HelpFigure
              src="/help/04-cliente-detalle-share.png"
              caption="Ficha del cliente con la URL, el QR y los botones para compartir por WhatsApp, Email o SMS."
            />

            <h3 style={h3Style}>Tres formas de compartir</h3>

            <h4 style={h4Style}>📱 WhatsApp (lo más rápido)</h4>
            <ol style={olStyle}>
              <li>
                En la ficha del cliente, pulsa el botón{" "}
                <strong>&ldquo;WhatsApp&rdquo;</strong>.
              </li>
              <li>
                Se abre WhatsApp en tu móvil/ordenador con un mensaje
                pre-escrito que incluye el enlace.
              </li>
              <li>Elige al cliente en tu lista de contactos y envía.</li>
            </ol>
            <Callout tone="info">
              El mensaje viene pre-rellenado pero puedes editarlo antes de
              enviar. Personalízalo si te apetece, pero <strong>no quites el
              enlace</strong>: es lo único imprescindible.
            </Callout>

            <h4 style={h4Style}>✉️ Email</h4>
            <ol style={olStyle}>
              <li>Pulsa <strong>&ldquo;Email&rdquo;</strong>.</li>
              <li>
                Se abre tu app de correo con destinatario, asunto y cuerpo ya
                escritos (si registraste su email al darlo de alta).
              </li>
              <li>Revisa y envía.</li>
            </ol>

            <h4 style={h4Style}>📷 QR (cara a cara, mostrador o impreso)</h4>
            <p style={pStyle}>
              Tienes dos QRs distintos:
            </p>
            <ul style={ulStyle}>
              <li>
                <strong>QR de tu enlace personal genérico</strong> (en{" "}
                <strong>&ldquo;Mi enlace&rdquo;</strong> del menú izquierdo).
                Es tu URL sin cliente identificado. Útil para imprimirlo y
                ponerlo en el mostrador, una tarjeta o un display físico —
                cualquiera que lo escanee deja reseña asociada a ti.
              </li>
              <li>
                <strong>QR específico por cliente</strong> (en cada ficha de
                cliente). Tiene el slug del cliente concreto, mejora la
                atribución cuando el cliente lo escanea.
              </li>
            </ul>
            <HelpFigure
              src="/help/05-qr-modal.png"
              caption="Pantalla 'Mi enlace' con tu URL personal, QR descargable, plantilla de mensaje y botones de compartir."
            />

            <Callout tone="warn">
              <strong>Qué NO hacer:</strong> compartir el enlace en bulk en
              grupos de WhatsApp o redes sociales. Google penaliza las reseñas
              que llegan en oleadas sospechosas. Una a una, con clientes
              reales con los que has trabajado.
            </Callout>
          </section>

          <Divider />

          {/* 6. Atribución */}
          <section id="atribucion">
            <h2 style={h2Style}>6. Cómo se atribuyen tus reseñas</h2>
            <p style={pStyle}>
              Cuando el cliente deja la reseña en Google, no aparece al
              instante en tu panel. Esta es la cronología:
            </p>
            <HelpFigure
              src="/help/06-flujo-atribucion.png"
              caption="Flujo: cliente abre tu enlace → escribe reseña en Google → sincronización → atribución → tu panel + email."
            />
            <ol style={olStyle}>
              <li>
                <strong>El cliente abre tu enlace</strong>. La app guarda esa
                visita.
              </li>
              <li>
                <strong>Escribe la reseña en Google</strong> (puede ser ese mismo
                día o unos días después).
              </li>
              <li>
                <strong>La app sincroniza con Google</strong>: cada hora durante
                el día (a y media de cada hora, de 6 de la mañana a 11 de la
                noche).
              </li>
              <li>
                <strong>El algoritmo te la atribuye</strong> si encuentra una
                visita a tu enlace en las <strong>48 horas previas</strong> a
                la reseña y el nombre del autor se parece al del cliente que
                registraste.
              </li>
              <li>
                <strong>Recibes un email</strong> con la reseña atribuida y la
                ves en tu panel.
              </li>
            </ol>
            <Callout tone="info">
              <strong>Si la reseña no te aparece atribuida:</strong> a veces el
              cliente usa un nombre muy distinto al que registraste, o tarda
              demasiado tiempo en escribirla (más de 48h tras abrir el enlace).
              En ese caso, el gestor de reseñas la verá en su bandeja y la
              atribuirá manualmente. No te preocupes — siempre cuenta.
            </Callout>
          </section>

          <Divider />

          {/* 7. Reseñas */}
          <section id="resenas">
            <h2 style={h2Style}>7. Ver tus reseñas</h2>
            <p style={pStyle}>
              En el menú izquierdo, clica{" "}
              <strong>&ldquo;Mis reseñas&rdquo;</strong>. Verás la lista
              completa con autor, valoración, texto y fecha. Puedes filtrar por
              mes y rango.
            </p>
            <HelpFigure
              src="/help/07-mis-resenas.png"
              caption="Listado de tus reseñas atribuidas, ordenadas por fecha. Cada fila muestra estrellas, texto y a qué cliente está asociada."
            />
            <p style={pStyle}>
              También puedes entrar en la ficha de un cliente concreto (desde{" "}
              <strong>&ldquo;Mis clientes&rdquo;</strong>) y ver únicamente las
              reseñas atribuidas a ese cliente.
            </p>
          </section>

          <Divider />

          {/* 8. Sincronizar */}
          <section id="sincronizar">
            <h2 style={h2Style}>8. Sincronizar manualmente</h2>
            <p style={pStyle}>
              Aunque la app sincroniza sola cada hora, a veces quieres
              comprobar al momento si una reseña que sabes que el cliente ha
              dejado ya está dentro. Para eso está el botón{" "}
              <strong>&ldquo;Buscar mis reseñas&rdquo;</strong> en tu panel.
            </p>
            <HelpFigure
              src="/help/08-boton-sincronizar.png"
              caption="Botón 'Buscar mis reseñas' en el panel del comercial. Trae las últimas reseñas de la ficha al instante."
            />
            <ol style={olStyle}>
              <li>Estás en <strong>&ldquo;Mi panel&rdquo;</strong>.</li>
              <li>
                Arriba a la derecha pulsa{" "}
                <strong>&ldquo;Buscar mis reseñas&rdquo;</strong>.
              </li>
              <li>
                En unos segundos verás un mensaje con cuántas reseñas nuevas
                ha encontrado.
              </li>
              <li>
                Si entró alguna nueva atribuida a ti, recibirás el email
                automático.
              </li>
            </ol>
            <Callout tone="info">
              <strong>¿Por qué a veces dice &ldquo;0 nuevas&rdquo;?</strong>
              Porque Google publica las reseñas con cierto retraso. Si el
              cliente acaba de escribirla, puede tardar entre 5 minutos y
              algunas horas en aparecer en tu panel. Espera y vuelve a probar.
            </Callout>
          </section>

          <Divider />

          {/* 9. Perfil */}
          <section id="perfil">
            <h2 style={h2Style}>9. Editar tu perfil</h2>
            <p style={pStyle}>
              Tu nombre y foto se ven en los emails que se envían al cliente y
              en el chrome de la app. Para cambiarlos, en el sidebar abajo del
              todo verás tu avatar. Cliclo y entrarás a{" "}
              <strong>&ldquo;Mi perfil&rdquo;</strong>.
            </p>
            <HelpFigure
              src="/help/09-perfil.png"
              caption="Página /perfil con la opción de cambiar tu foto y datos básicos. Accesible desde el avatar abajo del sidebar."
            />
            <ul style={ulStyle}>
              <li>
                <strong>Foto de perfil</strong>: arrastra una imagen o haz
                clic para subirla. Recomendado: cuadrada, 400×400 píxeles
                mínimo, formato JPG o PNG.
              </li>
              <li>
                <strong>Cerrar sesión</strong>: botón abajo. Útil cuando uses
                un ordenador compartido.
              </li>
            </ul>
            <Callout tone="warn">
              No puedes cambiar tu <strong>email</strong> ni tu{" "}
              <strong>ficha asignada</strong> desde aquí. Si necesitas un
              cambio, contacta con el administrador.
            </Callout>
          </section>

          <Divider />

          {/* 10. FAQ */}
          <section id="faq">
            <h2 style={h2Style}>10. Preguntas frecuentes</h2>

            <FAQ
              question="No me llega el email para entrar"
              answer={
                <>
                  Revisa la carpeta de Spam y promociones. Si tampoco está
                  ahí, avisa al administrador para que use{" "}
                  <strong>&ldquo;Reenviar acceso&rdquo;</strong> desde la
                  pantalla de comerciales.
                </>
              }
            />
            <FAQ
              question="Mi cliente dice que dejó reseña pero no la veo en mi panel"
              answer={
                <>
                  Tres posibles motivos: <strong>(1)</strong> Google aún no la
                  ha publicado (puede tardar horas), <strong>(2)</strong> la
                  escribió más de 48 horas después de abrir tu enlace, o{" "}
                  <strong>(3)</strong> el nombre que usó en Google es muy
                  distinto al que registraste. Prueba a pulsar{" "}
                  <strong>&ldquo;Buscar mis reseñas&rdquo;</strong> en tu
                  panel. Si pasa más de un día sin aparecer, avisa al gestor
                  de reseñas — la atribuirá manualmente si la encuentra.
                </>
              }
            />
            <FAQ
              question="¿Puedo cambiar el mensaje que se envía por WhatsApp?"
              answer="Sí. Cuando pulsas el botón de WhatsApp, se abre tu app con un mensaje pre-rellenado pero editable. Cambia lo que quieras antes de enviar. Lo único que no debes quitar es el enlace."
            />
            <FAQ
              question="¿Y si el cliente no tiene Google?"
              answer={
                <>
                  Para dejar reseña sí necesita una cuenta de Google. La gran
                  mayoría de la gente tiene una (asociada al Gmail o al móvil
                  Android). Si te dice que no, no te molestes en compartir el
                  enlace — pídele si quiere abrir una cuenta gratis (le lleva
                  2 minutos en su móvil) o pasa al siguiente cliente.
                </>
              }
            />
            <FAQ
              question="¿Cuántos clientes puedo dar de alta al mes?"
              answer="No hay límite. Cuantos más, mejor — más oportunidades de reseña. La meta mensual que ves en tu panel es de reseñas atribuidas, no de clientes dados de alta."
            />
            <FAQ
              question="¿Qué pasa si un cliente deja una reseña negativa?"
              answer={
                <>
                  La reseña entra igual y se te atribuye. No la oculta nadie.
                  Pero el administrador te avisará por email y juntos podéis
                  trabajar para resolver el motivo de la queja del cliente.
                  Una reseña negativa no es el fin del mundo si la respuesta
                  pública en Google es buena.
                </>
              }
            />
            <FAQ
              question="¿La app funciona en el móvil?"
              answer={
                <>
                  Sí, está hecha pensando en móvil. Tienes un menú de pestañas
                  abajo con: Panel, Enlace, Reseñas y Ranking. Solo la
                  pantalla &ldquo;Clientes&rdquo; se accede desde un atajo en
                  el propio Panel.
                </>
              }
            />

            <Card>
              <div
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: "var(--ink-2)",
                }}
              >
                <strong>¿Otra duda?</strong> Habla con el administrador
                (Alejandro o Rafael) o con el gestor de reseñas (Raquel o
                Bel). Estamos para ayudarte.
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

const h4Style: React.CSSProperties = {
  fontSize: 14.5,
  fontWeight: 600,
  marginTop: 16,
  marginBottom: 6,
  color: "var(--ink)",
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
