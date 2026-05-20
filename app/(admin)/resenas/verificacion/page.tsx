import { Topbar } from "@/components/layout/Topbar";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { Pill } from "@/components/ui/Pill";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function VerificationPage() {
  return (
    <>
      <Topbar
        title="Reseñas · Verificación"
        subtitle="Motor de verificación"
        range="Últimas 24 h"
        breadcrumb="Inseryal"
        right={
          <>
            <Pill tone="ok" withDot>
              Sincronizando · cada 10 min
            </Pill>
            <GhostBtn>Forzar sincronización</GhostBtn>
            <GhostBtn>Configurar</GhostBtn>
          </>
        }
      />
      <ComingSoon
        title="Pipeline de verificación y bandeja de reseñas sin asignar"
        description="Detalle de la reseña en curso (autor, evidencias, confianza), feed en vivo de detecciones, reseñas pendientes / sin asignar y reglas activas de atribución."
      />
    </>
  );
}
