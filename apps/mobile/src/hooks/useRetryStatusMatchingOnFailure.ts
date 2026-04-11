import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";

/**
 * Self-healing: listens for statusMatchingFailed WS events and re-enqueues
 * status matching. Guards against rapid re-fires with isPending.
 */
export function useRetryStatusMatchingOnFailure() {
  const { mutate: retryStatusMatching, isPending } = trpc.profiles.retryStatusMatching.useMutation();

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "statusMatchingFailed" && !isPending) {
        retryStatusMatching();
      }
    },
    [isPending, retryStatusMatching],
  );
  useWebSocket(wsHandler);
}
