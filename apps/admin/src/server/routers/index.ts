import { router } from "../trpc";
import { aiCostsRouter } from "./ai-costs";
import { conversationsRouter } from "./conversations";
import { groupsRouter } from "./groups";
import { matchingRouter } from "./matching";
import { pushLogRouter } from "./push-log";
import { queueRouter } from "./queue";
import { userAnalysesRouter } from "./user-analyses";
import { usersRouter } from "./users";
import { wavesRouter } from "./waves";

export const appRouter = router({
  aiCosts: aiCostsRouter,
  conversations: conversationsRouter,
  groups: groupsRouter,
  matching: matchingRouter,
  pushLog: pushLogRouter,
  queue: queueRouter,
  userAnalyses: userAnalysesRouter,
  users: usersRouter,
  waves: wavesRouter,
});

export type AppRouter = typeof appRouter;
