"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { GhostBtn } from "@/components/ui/GhostBtn";
import { linkGoogleLocation } from "../../actions";
import type { GoogleAccount, GoogleLocation } from "@/lib/google/business-profile";

export type GoogleLocationPickerProps = {
  locationId: string;
  currentPlaceId: string | null;
  accountsWithLocations: {
    account: GoogleAccount;
    locations: GoogleLocation[];
    error?: string;
  }[];
};

export function GoogleLocationPicker({
  locationId,
  currentPlaceId,
  accountsWithLocations,
}: GoogleLocationPickerProps) {
  const router = useRouter();

  // Pre-selecciona automáticamente la ficha cuyo placeId coincide con
  // currentPlaceId (si lo hay).
  const presetSelection = useMemo(() => {
    if (!currentPlaceId) return null;
    for (const acc of accountsWithLocations) {
      for (const l of acc.locations) {
        if (l.metadata?.placeId === currentPlaceId) {
          return { accountName: acc.account.name, locationName: l.name };
        }
      }
    }
    return null;
  }, [currentPlaceId, accountsWithLocations]);

  const [selection, setSelection] = useState<
    { accountName: string; locationName: string; placeId?: string } | null
  >(presetSelection ? { ...presetSelection, placeId: currentPlaceId ?? undefined } : null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    if (!selection) {
      setError("Selecciona una ficha de Google antes de continuar.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await linkGoogleLocation({
        locationId,
        googleAccountId: selection.accountName,
        googleLocationResource: selection.locationName,
        googlePlaceId: selection.placeId ?? null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/fichas?connected=1");
      router.refresh();
    });
  }

  const hasOptions = accountsWithLocations.some((a) => a.locations.length > 0);

  return (
    <>
      <Card>
        <div style={sectionLabel}>Cuentas de Google detectadas</div>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13,
            color: "var(--ink-3)",
            lineHeight: 1.55,
            maxWidth: 640,
          }}
        >
          Aparecen todas las cuentas y fichas que gestiona el email con el que
          te has autenticado. Elige la que corresponda a este apartamento /
          proyecto. Si tu ficha no aparece aquí, probablemente la cuenta de
          Google que has usado no tiene acceso al Business Profile de esa
          ubicación.
        </p>
      </Card>

      {!hasOptions ? (
        <Card>
          <div style={{ fontSize: 13, color: "var(--warn)", fontWeight: 500 }}>
            Esta cuenta de Google no gestiona ninguna ficha de Business Profile
          </div>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 12.5,
              color: "var(--ink-3)",
              lineHeight: 1.55,
            }}
          >
            Sale del flow y prueba con otra cuenta. Suelen ser las cuentas
            verificadas como managers/owners en business.google.com.
          </p>
        </Card>
      ) : (
        accountsWithLocations.map(({ account, locations, error: accErr }) => (
          <Card key={account.name} padding={0}>
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-3)",
                  fontWeight: 500,
                }}
              >
                {account.accountName} · {humanType(account.type)}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-4)",
                  fontFamily: "var(--font-mono)",
                  marginTop: 2,
                }}
              >
                {account.name}
              </div>
            </div>
            {accErr ? (
              <div
                style={{
                  padding: "18px 20px",
                  fontSize: 12.5,
                  color: "var(--warn)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {accErr}
              </div>
            ) : locations.length === 0 ? (
              <div
                style={{
                  padding: "18px 20px",
                  fontSize: 13,
                  color: "var(--ink-4)",
                }}
              >
                Esta cuenta no tiene fichas asociadas.
              </div>
            ) : (
              locations.map((l, i) => {
                const selected =
                  selection?.accountName === account.name &&
                  selection?.locationName === l.name;
                const isPlaceMatch =
                  currentPlaceId && l.metadata?.placeId === currentPlaceId;
                return (
                  <label
                    key={l.name}
                    style={{
                      display: "block",
                      padding: "14px 20px",
                      borderBottom:
                        i === locations.length - 1
                          ? "none"
                          : "1px solid var(--line)",
                      cursor: "pointer",
                      background: selected ? "var(--surface-2)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <input
                        type="radio"
                        name="google_location"
                        checked={selected}
                        onChange={() =>
                          setSelection({
                            accountName: account.name,
                            locationName: l.name,
                            placeId: l.metadata?.placeId,
                          })
                        }
                        style={{ flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            letterSpacing: "-0.005em",
                            fontSize: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {l.title}
                          {isPlaceMatch && (
                            <span
                              style={{
                                fontSize: 10.5,
                                background: "var(--ok-bg, #e3f3e7)",
                                color: "var(--ok, #1d7a3a)",
                                padding: "2px 7px",
                                borderRadius: 4,
                                fontWeight: 500,
                                letterSpacing: "0.02em",
                                textTransform: "uppercase",
                              }}
                            >
                              Place ID coincide
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--ink-4)",
                            marginTop: 3,
                          }}
                        >
                          {formatAddress(l) || "—"}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--ink-4)",
                            fontFamily: "var(--font-mono)",
                            marginTop: 4,
                          }}
                        >
                          {l.name}
                          {l.metadata?.placeId && ` · ${l.metadata.placeId}`}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </Card>
        ))
      )}

      {error && (
        <Card>
          <div
            role="alert"
            style={{
              padding: "8px 10px",
              background: "var(--warn-bg)",
              color: "var(--warn)",
              borderRadius: 8,
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <GhostBtn
          primary
          onClick={onSubmit}
          disabled={isPending || !selection}
          style={{ minWidth: 180 }}
        >
          {isPending ? "Vinculando…" : "Vincular esta ficha"}
        </GhostBtn>
      </div>
    </>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--ink-4)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 600,
};

function humanType(t: GoogleAccount["type"]): string {
  switch (t) {
    case "PERSONAL":
      return "Personal";
    case "BUSINESS":
      return "Business";
    case "ORGANIZATION":
      return "Organización";
    case "LOCATION_GROUP":
      return "Grupo de fichas";
    default:
      return "Cuenta";
  }
}

function formatAddress(l: GoogleLocation): string {
  const parts: string[] = [];
  if (l.storefrontAddress?.addressLines?.length) {
    parts.push(...l.storefrontAddress.addressLines);
  }
  if (l.storefrontAddress?.locality) {
    parts.push(l.storefrontAddress.locality);
  }
  return parts.join(", ");
}
