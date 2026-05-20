import { Topbar } from "@/components/layout/Topbar";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function ManagerResenasPage() {
  return (
    <>
      <Topbar
        title="Reseñas"
        subtitle="Vista solo lectura"
        range="Este mes"
        breadcrumb="Inseryal"
        right={<GhostBtn primary>Descargar Excel</GhostBtn>}
      />
      <ComingSoon
        title="Listado de reseñas con filtros"
        description="Filtros por ficha, comercial, estrellas, mes y año. Sin posibilidad de editar. Botón de descarga con el formato del parte semanal de Raquel."
      />
    </>
  );
}
