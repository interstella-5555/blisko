import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";

/**
 * Self-healing: listens for questionFailed WS events and re-enqueues
 * question generation. Guards against rapid re-fires with isPending.
 */
export function useRetryQuestionOnFailure(sessionId: string | null) {
  const retryQuestion = trpc.profiling.retryQuestion.useMutation();

  const wsHandler = useCallback(
    (msg: WSMessage) => {
      if (msg.type === "questionFailed" && msg.sessionId === sessionId && !retryQuestion.isPending) {
        retryQuestion.mutate({ sessionId: msg.sessionId });
      }
    },
    [sessionId, retryQuestion.isPending, retryQuestion.mutate],
  );
  useWebSocket(wsHandler);
}
