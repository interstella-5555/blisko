import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";

/**
 * Self-healing: listens for profilingFailed WS events and re-enqueues
 * profile generation. Guards against rapid re-fires with isPending.
 */
export function useRetryProfileOnFailure(sessionId: string | null) {
  const retryProfileGeneration = trpc.profiling.retryProfileGeneration.useMutation();

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "profilingFailed" && msg.sessionId === sessionId && !retryProfileGeneration.isPending) {
        retryProfileGeneration.mutate({ sessionId: msg.sessionId });
      }
    },
    [sessionId, retryProfileGeneration.isPending, retryProfileGeneration.mutate],
  );
  useWebSocket(wsHandler);
}
