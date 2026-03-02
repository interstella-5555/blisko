import { router } from './trpc';
import { profilesRouter } from './procedures/profiles';
import { wavesRouter } from './procedures/waves';
import { messagesRouter } from './procedures/messages';
import { profilingRouter } from './procedures/profiling';
import { groupsRouter } from './procedures/groups';
import { topicsRouter } from './procedures/topics';
import { accountsRouter } from './procedures/accounts';

export const appRouter = router({
  profiles: profilesRouter,
  waves: wavesRouter,
  messages: messagesRouter,
  profiling: profilingRouter,
  groups: groupsRouter,
  topics: topicsRouter,
  accounts: accountsRouter,
});

export type AppRouter = typeof appRouter;
