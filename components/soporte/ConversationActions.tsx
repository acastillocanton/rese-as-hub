"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { GhostBtn } from "@/components/ui/GhostBtn";
import {
  closeConversation,
  reopenConversation,
} from "@/app/(profile)/soporte/actions";

type ConversationActionsProps = {
  conversationId: string;
  status: "open" | "closed";
  canClose: boolean;
};

export function ConversationActions({
  conversationId,
  status,
  canClose,
}: ConversationActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!canClose) return null;

  const isOpen = status === "open";

  function handleClick() {
    startTransition(async () => {
      const res = isOpen
        ? await closeConversation(conversationId)
        : await reopenConversation(conversationId);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <GhostBtn onClick={handleClick} disabled={isPending}>
      {isPending ? "..." : isOpen ? "Cerrar consulta" : "Reabrir consulta"}
    </GhostBtn>
  );
}
