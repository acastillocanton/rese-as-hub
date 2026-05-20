import { Topbar } from "@/components/layout/Topbar";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function AjustesPage() {
  return (
    <>
      <Topbar
        title="Ajustes"
        subtitle="Configuración general"
        range=""
        breadcrumb="Inseryal"
      />
      <ComingSoon
        title="Ajustes generales"
        description="Reglas de matching, ventana temporal, plantilla del email de invitación, configuración del cron de sincronización."
      />
    </>
  );
}
