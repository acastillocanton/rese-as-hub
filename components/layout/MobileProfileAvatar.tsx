import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";

type Props = {
  name: string;
  avatarUrl: string | null;
};

/**
 * Avatar fijo arriba a la derecha en mobile — Link a /perfil. Se monta
 * dentro del wrapper `<div className="m-hide-desktop">` de los layouts
 * con vista mobile (sales y, desde la migración 011, office_director).
 * No aparece en desktop ni para admin/reviews_manager.
 *
 * Hay que reservar `padding-right` en el topbar mobile (clase
 * `m-topbar-compact` en globals.css) para que sus controles no se
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
