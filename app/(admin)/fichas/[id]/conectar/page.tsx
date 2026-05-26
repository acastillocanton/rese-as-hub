import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getValidAccessTokenForLocation,
  listAccounts,
  listLocations,
  type GoogleAccount,
  type GoogleLocation,
} from "@/lib/google/business-profile";
import { GoogleLocationPicker } from "./GoogleLocationPicker";

type PageProps = { params: Promise<{ id: string }> };

type LocationRow = {
  id: string;
  name: string;
  google_place_id: string | null;
  google_account_email: string | null;
  oauth_status: string;
};

type AccountWithLocations = {
  account: GoogleAccount;
  locations: GoogleLocation[];
  error?: string;
};

export default async function ConectarFichaPage({ params }: PageProps) {
  const { id } = await params;

  const admin = createServiceClient();
  const { data: loc } = await admin
    .from("locations")
    .select("id, name, google_place_id, google_account_email, oauth_status")
    .eq("id", id)
    .maybeSingle<LocationRow>();
  if (!loc) notFound();

  // Si no hay tokens almacenados (callback aún no pasó), volvemos a /fichas.
  // El admin tiene que iniciar el flow desde el botón "Conectar Google".
  const accessToken = await getValidAccessTokenForLocation(loc.id);
  if (!accessToken) {
    redirect(`/fichas?oauth_error=no_tokens&loc=${loc.id}`);
  }

  // Listamos todas las cuentas + sus fichas en paralelo. Si alguna falla
  // (p.ej. la API de reviews no está aprobada aún), capturamos error
  // por cuenta sin romper la página entera.
  let fetchError: string | null = null;
  let accountsWithLocations: AccountWithLocations[] = [];
  try {
    const accounts = await listAccounts(accessToken);
    accountsWithLocations = await Promise.all(
      accounts.map(async (account) => {
        try {
          const locs = await listLocations(accessToken, account.name);
          return { account, locations: locs };
        } catch (e) {
          return {
            account,
            locations: [],
            error: e instanceof Error ? e.message : "Fallo al listar fichas",
          };
        }
      }),
    );
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "Fallo al listar cuentas";
  }

  return (
    <>
      <Topbar
        title={`Conectar Google · ${loc.name}`}
        subtitle={
          loc.google_account_email
            ? `Autenticado como ${loc.google_account_email}`
            : "Selecciona la ficha de Google Business Profile"
        }
        breadcrumb="Fichas"
        breadcrumbHref="/fichas"
        range=""
        right={
          <Link
            href="/fichas"
            style={{
              padding: "7px 12px",
              background: "transparent",
              border: "1px solid var(--line-strong)",
              borderRadius: 9,
              fontSize: 13,
              color: "var(--ink-2)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            ← Cancelar
          </Link>
        }
      />

      <div
        style={{
          flex: 1,
          padding: "24px 32px 32px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {fetchError ? (
          <Card>
            <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 500 }}>
              No hemos podido listar tus cuentas de Google
            </div>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 12.5,
                color: "var(--ink-3)",
                fontFamily: "var(--font-mono)",
                wordBreak: "break-all",
              }}
            >
              {fetchError}
            </p>
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 13,
                color: "var(--ink-3)",
                lineHeight: 1.55,
              }}
            >
              Si ves un 403 o &quot;User not authorized&quot;, suele significar que la API
              &quot;My Business Account Management&quot; aún no está habilitada en el
              proyecto de Google Cloud, o que tu email no está en la lista de
              test users del consent screen.
            </p>
          </Card>
        ) : (
          <GoogleLocationPicker
            locationId={loc.id}
            currentPlaceId={loc.google_place_id}
            accountsWithLocations={accountsWithLocations}
          />
        )}
      </div>
    </>
  );
}
