import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";

/**
 * Self-healing: listens for profileFailed WS events and re-enqueues
 * profile AI generation. Guards against rapid re-fires with isPending.
 */
export function useRetryProfileAIOnFailure() {
  const { mutate: retryProfileAI, isPending } = trpc.profiles.retryProfileAI.useMutation();

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "profileFailed" && !isPending) {
        retryProfileAI();
      }
    },
    [isPending, retryProfileAI],
  );
  useWebSocket(wsHandler);
}
