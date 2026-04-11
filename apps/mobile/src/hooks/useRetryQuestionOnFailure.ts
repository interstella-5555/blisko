import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";

/**
 * Self-healing: listens for questionFailed WS events and re-enqueues
 * question generation. Guards against rapid re-fires with isPending.
 */
export function useRetryQuestionOnFailure(sessionId: string | null) {
  const { mutate: retryQuestion, isPending } = trpc.profiling.retryQuestion.useMutation();

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "questionFailed" && msg.sessionId === sessionId && !isPending) {
        retryQuestion({ sessionId: msg.sessionId });
      }
    },
    [sessionId, isPending, retryQuestion],
  );
  useWebSocket(wsHandler);
}
