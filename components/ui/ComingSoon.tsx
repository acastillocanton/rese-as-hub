import { Card } from "./Card";

type ComingSoonProps = {
  title: string;
  description?: string;
};

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div style={{ flex: 1, padding: "24px 32px 32px" }}>
      <Card padding={28}>
        <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>
          En construcción
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            marginTop: 4,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        {description && (
          <p
            style={{
              margin: "10px 0 0",
              color: "var(--ink-3)",
              fontSize: 13.5,
              lineHeight: 1.55,
              maxWidth: 560,
            }}
          >
            {description}
          </p>
        )}
      </Card>
    </div>
  );
}
