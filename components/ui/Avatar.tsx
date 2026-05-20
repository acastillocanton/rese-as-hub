import { avatarColor, initials } from "@/lib/utils";

type AvatarProps = {
  name: string;
  size?: number;
  color?: string;
};

export function Avatar({ name, size = 36, color }: AvatarProps) {
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
