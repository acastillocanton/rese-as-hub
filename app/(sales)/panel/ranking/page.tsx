import { Topbar } from "@/components/layout/Topbar";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function RankingPage() {
  return (
    <>
      <Topbar
        title="Ranking"
        subtitle="Próximamente"
        breadcrumb="Mi panel"
        range={null}
      />
      <ComingSoon
        title="Ranking del equipo"
        description="Próximamente: tu posición, las insignias del mes y el podio de tus compañeros."
      />
    </>
  );
}
