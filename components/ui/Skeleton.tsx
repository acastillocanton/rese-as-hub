import type { CSSProperties } from "react";

type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
};

/**
 * Bloque animado para placeholders mientras carga una página o sección.
 * Lo consumen los `loading.tsx` por route group. La animación shimmer vive
 * en `globals.css` (`@keyframes skeleton-shimmer`).
 */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, #ECECEE 0%, #F5F5F7 50%, #ECECEE 100%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}
