"use client";

import { ErrorState } from "@/components/layout/ErrorState";

export default function ManagerError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState {...props} title="Algo ha fallado en el panel de manager" />;
}
