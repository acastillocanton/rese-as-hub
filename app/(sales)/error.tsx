"use client";

import { ErrorState } from "@/components/layout/ErrorState";

export default function SalesError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState {...props} title="Algo ha fallado en tu panel" />;
}
