import { Topbar } from "@/components/layout/Topbar";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { getCurrentUserBrand } from "@/lib/supabase/current-brand";
import { getBrandBreadcrumb } from "@/lib/branding";

export default async function AjustesPage() {
  const brand = await getCurrentUserBrand();
  return (
    <>
      <Topbar
        title="Ajustes"
        subtitle="Configuración general"
        range=""
        breadcrumb={getBrandBreadcrumb(brand)}
      />
      <ComingSoon
        title="Ajustes generales"
        description="Reglas de matching, ventana temporal, plantilla del email de invitación, configuración del cron de sincronización."
      />
    </>
  );
}
