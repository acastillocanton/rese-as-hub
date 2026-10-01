import { isSafeNext } from "@/lib/url-validation";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildAuthConfirmationPage({
  tokenHash,
  type,
  next,
}: {
  tokenHash: string;
  type: string;
  next: string;
}) {
  const safeNext = isSafeNext(next) ? next : "/";

  return `<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Confirmar acceso</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f4f7fb; margin: 0; display: grid; place-items: center; min-height: 100vh; color: #0f172a; }
          .card { width: min(440px, calc(100vw - 32px)); background: white; border-radius: 18px; border: 1px solid #dfe7f3; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); padding: 28px 24px; }
          h1 { margin: 0 0 12px; font-size: 1.7rem; }
          p { margin: 0 0 20px; line-height: 1.5; color: #475569; }
          form { display: grid; gap: 12px; }
          button { appearance: none; border: none; background: #0f172a; color: white; padding: 12px 16px; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; }
          button:hover { background: #1e293b; }
          .small { font-size: 0.8rem; color: #64748b; }
        </style>
      </head>
      <body>
        <main class="card">
          <h1>Confirmar acceso</h1>
          <p>Haz clic en el botón para terminar el acceso a ReseñaHub y entrar a tu zona.</p>
          <form method="POST" action="/auth/confirm">
            <input type="hidden" name="token_hash" value="${escapeHtml(tokenHash)}" />
            <input type="hidden" name="type" value="${escapeHtml(type)}" />
            <input type="hidden" name="next" value="${escapeHtml(safeNext)}" />
            <button type="submit">Entrar a ReseñaHub</button>
          </form>
          <p class="small">Si el enlace se abrió por error, cierra esta página y vuelve a pedir un acceso nuevo.</p>
        </main>
      </body>
    </html>`;
}