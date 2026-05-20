import { Topbar } from "@/components/layout/Topbar";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { ComingSoon } from "@/components/ui/ComingSoon";

type Params = Promise<{ slug: string }>;

export default async function ComercialProfilePage({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <>
      <Topbar
        title={`Comerciales · ${slug}`}
        subtitle="Ficha del comercial"
        range="Este mes"
        breadcrumb="Inseryal"
        right={
          <>
            <GhostBtn>Editar ficha</GhostBtn>
            <GhostBtn>Suspender</GhostBtn>
            <GhostBtn primary>Compartir enlace</GhostBtn>
          </>
        }
      />
      <ComingSoon
        title={`Ficha del comercial @${slug}`}
        description="Hero con avatar y KPIs, gráfico de evolución mensual, histórico de reseñas verificadas, enlace personal + QR, objetivos y logros."
      />
    </>
  );
}
