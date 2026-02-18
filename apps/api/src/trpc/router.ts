import { router } from './trpc';
import { profilesRouter } from './procedures/profiles';
import { wavesRouter } from './procedures/waves';
import { messagesRouter } from './procedures/messages';
import { profilingRouter } from './procedures/profiling';
import { groupsRouter } from './procedures/groups';
import { topicsRouter } from './procedures/topics';

export const appRouter = router({
  profiles: profilesRouter,
  waves: wavesRouter,
  messages: messagesRouter,
  profiling: profilingRouter,
  groups: groupsRouter,
  topics: topicsRouter,
});

export type AppRouter = typeof appRouter;
