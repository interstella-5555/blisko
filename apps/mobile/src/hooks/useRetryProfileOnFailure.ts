import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";

/**
 * Self-healing: listens for profilingFailed WS events and re-enqueues
 * profile generation. Guards against rapid re-fires with isPending.
 */
export function useRetryProfileOnFailure(sessionId: string | null) {
  const { mutate: retryProfileGeneration, isPending } = trpc.profiling.retryProfileGeneration.useMutation();

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "profilingFailed" && msg.sessionId === sessionId && !isPending) {
        retryProfileGeneration({ sessionId: msg.sessionId });
      }
    },
    [sessionId, isPending, retryProfileGeneration],
  );
  useWebSocket(wsHandler);
}
