"use client";

import { useState } from "react";
import { GhostBtn } from "@/components/ui/GhostBtn";

export function CopyLinkButton({
  url,
  label,
  primary,
}: {
  url: string;
  label: string;
  primary?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — older browsers without clipboard API
    }
  }

  return (
    <GhostBtn primary={primary} onClick={onCopy}>
      {copied ? "✓ Copiado" : label}
    </GhostBtn>
  );
}
