import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";

type Props = {
  name: string;
  avatarUrl: string | null;
};

/**
 * Avatar fijo arriba a la derecha en mobile sales — Link a /perfil.
 * Solo se monta dentro del wrapper `<div className="sales-hide-desktop">`
 * del (sales)/layout y del (profile)/layout (cuando el rol es sales),
 * así no aparece en desktop ni para admin/manager.
 *
 * Hay que reservar `padding-right` en el topbar mobile (clase
 * `sales-topbar-compact` en globals.css) para que sus controles no se
 * solapen con este avatar.
 */
export function MobileProfileAvatar({ name, avatarUrl }: Props) {
  return (
    <Link
      href="/perfil"
      aria-label="Ver mi perfil"
      style={{
        position: "fixed",
        top: "calc(12px + env(safe-area-inset-top, 0px))",
        right: 14,
        zIndex: 25,
        display: "block",
        borderRadius: 999,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      <Avatar name={name} src={avatarUrl} size={34} />
    </Link>
  );
}
