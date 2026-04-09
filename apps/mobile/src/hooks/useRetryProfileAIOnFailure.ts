import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";

/**
 * Self-healing: listens for profileFailed WS events and re-enqueues
 * profile AI generation. Guards against rapid re-fires with isPending.
 */
export function useRetryProfileAIOnFailure() {
  const retryProfileAI = trpc.profiles.retryProfileAI.useMutation();

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "profileFailed" && !retryProfileAI.isPending) {
        retryProfileAI.mutate();
      }
    },
    [retryProfileAI.isPending, retryProfileAI.mutate],
  );
  useWebSocket(wsHandler);
}
