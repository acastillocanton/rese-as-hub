import { LogOut } from "lucide-react";

/**
 * Botón "Cerrar sesión" del sidebar. Es un form con action a /auth/signout
 * (route handler ya existente) para hacer POST y dejar que el server elimine
 * la sesión y redirija a /login. Funciona sin JS por ser un form nativo.
 */
export function LogoutButton() {
  return (
    <form action="/auth/signout" method="post" style={{ margin: 0 }}>
      <button
        type="submit"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "transparent",
          border: "1px solid var(--line)",
          color: "var(--ink-3)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </form>
  );
}
