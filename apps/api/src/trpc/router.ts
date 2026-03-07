import { accountsRouter } from "./procedures/accounts";
import { groupsRouter } from "./procedures/groups";
import { messagesRouter } from "./procedures/messages";
import { profilesRouter } from "./procedures/profiles";
import { profilingRouter } from "./procedures/profiling";
import { pushTokensRouter } from "./procedures/pushTokens";
import { topicsRouter } from "./procedures/topics";
import { wavesRouter } from "./procedures/waves";
import { router } from "./trpc";

export const appRouter = router({
  profiles: profilesRouter,
  waves: wavesRouter,
  messages: messagesRouter,
  profiling: profilingRouter,
  groups: groupsRouter,
  topics: topicsRouter,
  accounts: accountsRouter,
  pushTokens: pushTokensRouter,
});

export type AppRouter = typeof appRouter;
