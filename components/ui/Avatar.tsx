import { avatarColor, initials } from "@/lib/utils";

type AvatarProps = {
  name: string;
  size?: number;
  color?: string;
  /** URL de la foto de perfil; si está, se pinta como <img>. Si no, fallback
   *  al círculo de color con iniciales. */
  src?: string | null;
};

export function Avatar({ name, size = 36, color, src }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          flexShrink: 0,
          display: "block",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color || avatarColor(name),
        color: "#3C3C43",
        display: "grid",
        placeItems: "center",
        fontWeight: 600,
        fontSize: size * 0.36,
        letterSpacing: "-0.02em",
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}
