import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos del Servicio · ReseñaHub",
  description:
    "Condiciones de uso de ReseñaHub, la plataforma interna de gestión de reseñas de Inseryal by Marina d'Or.",
};

export default function TerminosPage() {
  return (
    <>
      <h1 style={h1}>Términos del Servicio</h1>
      <p style={lede}>
        Última actualización: 21 de mayo de 2026.
      </p>

      <p style={p}>
        Estos términos regulan el acceso y uso de ReseñaHub, la aplicación
        interna de Inseryal by Marina d&apos;Or. Al iniciar sesión aceptas
        cumplir lo que se describe a continuación.
      </p>

      <h2 style={h2}>1. Quién puede usar la herramienta</h2>
      <p style={p}>
        ReseñaHub es una herramienta de uso exclusivo del personal autorizado
        de Inseryal by Marina d&apos;Or. El acceso se concede por invitación
        del administrador, mediante enlace mágico enviado al correo
        corporativo. No está disponible al público general.
      </p>

      <h2 style={h2}>2. Naturaleza del servicio</h2>
      <p style={p}>
        ReseñaHub centraliza el flujo interno de reseñas de Google que
        atribuimos a cada comercial. La herramienta:
      </p>
      <ul style={ul}>
        <li>
          Genera enlaces personalizados de tipo{" "}
          <code style={code}>/c/[comercial]/[cliente]</code> que redirigen a
          la pantalla de Google Maps para dejar reseña.
        </li>
        <li>
          Sincroniza las reseñas recibidas vía la API de Google Business
          Profile, sujeta a la aprobación de Google.
        </li>
        <li>
          Asigna cada reseña al comercial responsable según un algoritmo
          interno (ventana temporal + similitud de nombre).
        </li>
        <li>
          Proporciona paneles internos para administradores, comerciales y
          el gestor de reseñas.
        </li>
      </ul>

      <h2 style={h2}>3. Uso aceptable</h2>
      <p style={p}>
        Como persona usuaria autorizada te comprometes a:
      </p>
      <ul style={ul}>
        <li>Usar la herramienta solo para los fines previstos por Inseryal.</li>
        <li>
          No compartir tus credenciales de acceso ni dejar la sesión abierta
          en dispositivos compartidos.
        </li>
        <li>
          Tratar con confidencialidad la información que veas dentro de la
          herramienta, incluidos clientes, métricas de otros comerciales,
          tokens OAuth y resultados del matching.
        </li>
        <li>
          No intentar acceder a información de roles distintos al tuyo, ni
          eludir los controles de acceso del sistema.
        </li>
        <li>
          No automatizar el envío masivo de enlaces a clientes ni generar
          tráfico artificial hacia las fichas de Google. Las reseñas tienen
          que venir de visitas comerciales reales.
        </li>
      </ul>

      <h2 style={h2}>4. Datos del cliente que tú introduces</h2>
      <p style={p}>
        Cuando un comercial registra un cliente en su panel, asume que ha
        recabado el dato (nombre, y opcionalmente email/teléfono) de forma
        legítima dentro de la conversación comercial. Si el cliente solicita
        que sus datos sean eliminados, debes hacerlo desde la ficha del
        cliente o avisar al administrador para que lo gestione.
      </p>

      <h2 style={h2}>5. Disponibilidad</h2>
      <p style={p}>
        ReseñaHub se ofrece &quot;tal cual&quot;. Hacemos un esfuerzo
        razonable para que esté disponible, pero pueden producirse
        interrupciones por mantenimiento, fallos de los servicios de
        terceros (Supabase, Vercel, Google, Brevo) o causas de fuerza mayor.
        El servicio no garantiza la sincronización en tiempo real de las
        reseñas: hay un cron periódico y la API de Google puede aplicar
        sus propios límites.
      </p>

      <h2 style={h2}>6. Limitación de responsabilidad</h2>
      <p style={p}>
        Inseryal by Marina d&apos;Or no será responsable de daños indirectos
        o consecuenciales derivados del uso o imposibilidad de uso de
        ReseñaHub. La atribución automática de reseñas es una propuesta del
        sistema; la decisión final de contabilizar una reseña recae en el
        administrador, quien puede reasignar manualmente desde la bandeja
        de verificación.
      </p>

      <h2 style={h2}>7. Propiedad intelectual</h2>
      <p style={p}>
        La aplicación, su código fuente, diseño y contenidos pertenecen a
        Inseryal by Marina d&apos;Or. Las reseñas y datos públicos
        provenientes de Google pertenecen a sus respectivos autores y se
        utilizan dentro de los términos de la API de Google Business
        Profile.
      </p>

      <h2 style={h2}>8. Modificaciones</h2>
      <p style={p}>
        Estos términos pueden actualizarse. La fecha de la última
        actualización aparece arriba. Cambios materiales se comunicarán a
        las personas con acceso por correo electrónico.
      </p>

      <h2 style={h2}>9. Legislación aplicable</h2>
      <p style={p}>
        Estos términos se rigen por la legislación española. Cualquier
        controversia se someterá a los juzgados y tribunales de{" "}
        <em>[domicilio social a completar]</em>, salvo que la ley imponga
        otro fuero por la condición de consumidor de la otra parte.
      </p>

      <h2 style={h2}>10. Contacto</h2>
      <p style={p}>
        Para cualquier asunto relacionado con estos términos:{" "}
        <em>[legal@inseryal.es · completar]</em>.
      </p>
    </>
  );
}

const h1: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 32,
  fontWeight: 700,
  letterSpacing: "-0.025em",
  margin: "0 0 12px",
};
const lede: React.CSSProperties = {
  margin: "0 0 28px",
  fontSize: 13.5,
  color: "var(--ink-4)",
};
const h2: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 19,
  fontWeight: 600,
  letterSpacing: "-0.015em",
  margin: "32px 0 12px",
};
const p: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 14.5,
  lineHeight: 1.65,
  color: "var(--ink-2)",
};
const ul: React.CSSProperties = {
  margin: "0 0 14px",
  paddingLeft: 22,
  fontSize: 14.5,
  lineHeight: 1.65,
  color: "var(--ink-2)",
};
const code: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  padding: "1px 4px",
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: 4,
};
