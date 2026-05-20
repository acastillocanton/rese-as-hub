import { Topbar } from "@/components/layout/Topbar";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function ClientesPage() {
  return (
    <>
      <Topbar
        title="Mis clientes"
        subtitle="Genera un enlace personalizado por visita"
        range=""
        breadcrumb="Inseryal"
        right={<GhostBtn primary>+ Nuevo cliente</GhostBtn>}
      />
      <ComingSoon
        title="Alta rápida de cliente y enlace personalizado"
        description="Introduce nombre del cliente → genera reseñahub.es/c/tu-slug/nombre-cliente y muéstralo en QR + deep-links de WhatsApp / Email / SMS prellenados con el mensaje sugerido."
      />
    </>
  );
}
