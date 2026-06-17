import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // Las capturas del centro de ayuda (public/help/*.png) llevan datos de un
    // comercial real (§4.59): las metemos en el middleware (el patrón de arriba
    // excluye .png) para exigir login. Servidas solo a usuarios autenticados.
    "/help/:path*",
  ],
};
