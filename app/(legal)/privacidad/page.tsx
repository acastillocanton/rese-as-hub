import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad · ReseñaHub",
  description:
    "Cómo tratamos los datos personales dentro de ReseñaHub, la plataforma interna de gestión de reseñas de Inseryal by Marina d'Or.",
};

export default function PrivacidadPage() {
  return (
    <>
      <h1 style={h1}>Política de Privacidad</h1>
      <p style={lede}>
        Última actualización: 21 de mayo de 2026.
      </p>

      <p style={p}>
        Esta política explica cómo se tratan los datos personales dentro de
        ReseñaHub, una aplicación interna de Inseryal by Marina d&apos;Or
        diseñada para gestionar la atribución de reseñas de Google a los
        comerciales del grupo. ReseñaHub no se ofrece a terceros: es una
        herramienta interna, de uso exclusivo del personal autorizado.
      </p>

      <h2 style={h2}>1. Responsable del tratamiento</h2>
      <p style={p}>
        <strong>[Inseryal by Marina d&apos;Or, S.L.]</strong>
        <br />
        CIF: <em>[Pendiente · completar]</em>
        <br />
        Domicilio social: <em>[Pendiente · completar]</em>
        <br />
        Correo de contacto para temas de privacidad:{" "}
        <em>[privacidad@inseryal.es · completar]</em>
      </p>

      <h2 style={h2}>2. Datos que tratamos</h2>
      <p style={p}>
        ReseñaHub recoge distintos tipos de datos según el rol que tengas
        dentro de la herramienta:
      </p>
      <h3 style={h3}>Personal de Inseryal con acceso a la app</h3>
      <ul style={ul}>
        <li>Nombre completo, correo electrónico corporativo, teléfono (opcional).</li>
        <li>
          Rol asignado: administrador, comercial o gestor de reseñas.
        </li>
        <li>
          Ficha de Google Business Profile asignada (si procede).
        </li>
        <li>
          Datos técnicos derivados de la autenticación (tokens de sesión,
          última vez activo).
        </li>
      </ul>
      <h3 style={h3}>Clientes registrados por los comerciales</h3>
      <ul style={ul}>
        <li>
          Nombre completo del cliente y, opcionalmente, correo electrónico y
          teléfono — facilitados por el comercial para crear el enlace
          personalizado de reseña.
        </li>
        <li>
          Registro de aperturas del enlace personalizado (
          <code style={code}>share_links</code>): fecha/hora, canal por el que
          se envió (WhatsApp, email, SMS, QR, directo) y user-agent del
          navegador.
        </li>
      </ul>
      <h3 style={h3}>Datos sincronizados desde Google Business Profile</h3>
      <ul style={ul}>
        <li>
          Reseñas publicadas en las fichas de Google de Inseryal: nombre que
          mostró el autor en Google, valoración en estrellas, texto de la
          reseña, fecha de creación e identificador interno de la reseña.
        </li>
        <li>
          Información administrativa de la ficha: identificador de cuenta de
          Google, identificador de la ficha y email de la cuenta de Google que
          autorizó la conexión.
        </li>
        <li>
          Tokens OAuth (acceso y refresh) cifrados y guardados con acceso
          restringido. Nunca se exponen al navegador del usuario.
        </li>
      </ul>

      <h2 style={h2}>3. Finalidad del tratamiento</h2>
      <ul style={ul}>
        <li>
          Permitir que cada comercial genere un enlace personalizado por
          cliente y comparta el enlace por sus canales habituales.
        </li>
        <li>
          Atribuir automáticamente las reseñas recibidas en Google al
          comercial responsable mediante un algoritmo que combina ventana
          temporal y similitud del nombre del autor.
        </li>
        <li>
          Mostrar paneles internos con métricas de actividad por comercial,
          por ficha y agregadas.
        </li>
        <li>
          Generar un informe mensual descargable para la persona responsable
          de seguimiento de reseñas en Inseryal.
        </li>
      </ul>

      <h2 style={h2}>4. Base legal</h2>
      <p style={p}>
        El tratamiento se basa en el interés legítimo del responsable
        (art. 6.1.f RGPD) para la gestión interna de su personal y de las
        reseñas públicas de sus fichas de Google. Para los empleados con
        acceso, también opera la base contractual (art. 6.1.b).
      </p>
      <p style={p}>
        Los datos de clientes que aparecen en ReseñaHub son los mínimos para
        identificar al autor de una reseña. Las reseñas en sí son contenido
        que el cliente publicó voluntariamente en Google y que ya es público.
      </p>

      <h2 style={h2}>5. Encargados del tratamiento (terceros)</h2>
      <p style={p}>
        Los datos se procesan utilizando los siguientes servicios:
      </p>
      <ul style={ul}>
        <li>
          <strong>Supabase</strong> (alojamiento de base de datos y
          autenticación) — proveedor de infraestructura cloud, servidores en
          la UE.
        </li>
        <li>
          <strong>Vercel</strong> (hosting de la aplicación) — servidores en
          la UE.
        </li>
        <li>
          <strong>Google</strong> (Business Profile API + cuenta corporativa
          OAuth) — solo accedemos a las fichas para las que el responsable
          autorizó conexión.
        </li>
        <li>
          <strong>Brevo</strong> (envío de correos transaccionales de acceso) —
          servidores en la UE.
        </li>
      </ul>
      <p style={p}>
        Cada uno de estos proveedores tiene su propia política de privacidad
        y firma con el responsable un Acuerdo de Tratamiento de Datos según
        exige el RGPD.
      </p>

      <h2 style={h2}>6. Conservación</h2>
      <ul style={ul}>
        <li>
          Datos de empleados: durante la relación contractual y los plazos
          legales aplicables tras finalizarla.
        </li>
        <li>
          Datos de clientes y enlaces compartidos: mientras sean necesarios
          para la atribución (~12 meses), salvo borrado manual antes.
        </li>
        <li>
          Reseñas sincronizadas: mientras existan en Google. Si Google las
          retira, en el siguiente sync se actualiza el estado en ReseñaHub.
        </li>
        <li>
          Tokens OAuth: hasta que el responsable revoque la conexión desde el
          panel de fichas o desde su cuenta de Google.
        </li>
      </ul>

      <h2 style={h2}>7. Derechos de las personas</h2>
      <p style={p}>
        Cualquier persona cuyos datos consten en ReseñaHub puede ejercer los
        derechos reconocidos por el RGPD: acceso, rectificación, supresión,
        oposición, limitación del tratamiento y portabilidad. Para hacerlo,
        envía un correo a <em>[privacidad@inseryal.es · completar]</em>{" "}
        identificándote y describiendo qué derecho quieres ejercer.
      </p>
      <p style={p}>
        Si consideras que el tratamiento de tus datos no se ajusta a la
        normativa, puedes reclamar ante la Agencia Española de Protección de
        Datos (<a href="https://www.aepd.es" style={a}>aepd.es</a>).
      </p>

      <h2 style={h2}>8. Cambios en esta política</h2>
      <p style={p}>
        Esta política puede actualizarse para reflejar cambios en el producto
        o en la legislación aplicable. La fecha de la última actualización
        aparece al principio del documento. Si los cambios son
        sustanciales, los usuarios con acceso a la herramienta serán
        notificados por correo.
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
const h3: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 15,
  fontWeight: 600,
  margin: "22px 0 8px",
  color: "var(--ink-2)",
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
const a: React.CSSProperties = {
  color: "var(--ink)",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};
const code: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  padding: "1px 4px",
  background: "var(--surface-2)",
  border: "1px solid var(--line)",
  borderRadius: 4,
};
