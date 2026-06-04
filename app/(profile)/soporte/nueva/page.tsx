import { redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { NewConversationForm } from "@/components/soporte/NewConversationForm";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isProducer, type Role } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function NuevaConsultaPage() {
  if (!isSupabaseConfigured()) {
    return <div style={{ padding: 32 }}>Supabase no configurado.</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: Role }>();

  const role = profile?.role ?? "sales";

  // Load reviews and clients for optional linking
  // For producers: their own reviews and clients
  // For admin/manager: recent reviews (scoped by RLS)
  let reviews: { id: string; label: string }[] = [];
  let clients: { id: string; label: string }[] = [];

  type ReviewRow = { id: string; author_name: string; rating: number; google_created_at: string };
  type ClientRow = { id: string; full_name: string };

  const mapReviews = (data: ReviewRow[]) =>
    data.map((r) => ({
      id: r.id,
      label: `${r.author_name} · ${"★".repeat(r.rating)} · ${new Date(r.google_created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`,
    }));

  if (isProducer(role)) {
    const { data: reviewData } = await supabase
      .from("reviews")
      .select("id, author_name, rating, google_created_at")
      .eq("sales_id", user.id)
      .is("removed_at" as string & keyof never, null)
      .order("google_created_at", { ascending: false })
      .limit(50)
      .returns<ReviewRow[]>();
    if (reviewData) reviews = mapReviews(reviewData);

    const { data: clientData } = await supabase
      .from("clients")
      .select("id, full_name")
      .eq("sales_id", user.id)
      .order("full_name")
      .limit(100)
      .returns<ClientRow[]>();
    if (clientData) clients = clientData.map((c) => ({ id: c.id, label: c.full_name }));
  } else {
    const { data: reviewData } = await supabase
      .from("reviews")
      .select("id, author_name, rating, google_created_at")
      .is("removed_at" as string & keyof never, null)
      .order("google_created_at", { ascending: false })
      .limit(50)
      .returns<ReviewRow[]>();
    if (reviewData) reviews = mapReviews(reviewData);
  }

  return (
    <>
      <Topbar
        title="Nueva consulta"
        range={null}
        breadcrumb="Soporte"
        breadcrumbHref="/soporte"
        compact
      />
      <div style={{ padding: "24px 32px" }} className="m-page-pad">
        <NewConversationForm reviews={reviews} clients={clients} />
      </div>
    </>
  );
}
