import { Topbar } from "@/components/layout/Topbar";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function ManagerExportPage() {
  return (
    <>
      <Topbar
        title="Exportar Excel"
        subtitle="Parte de reseñas en Excel"
        range=""
        breadcrumb="Inseryal"
      />
      <ComingSoon
        title="Generador de Excel mensual / semanal"
        description="Selecciona el rango, las fichas, y descarga el .xlsx con las reseñas y su atribución."
      />
    </>
  );
}
