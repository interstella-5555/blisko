import { router } from './trpc';
import { profilesRouter } from './procedures/profiles';
import { wavesRouter } from './procedures/waves';
import { messagesRouter } from './procedures/messages';
import { profilingRouter } from './procedures/profiling';

export const appRouter = router({
  profiles: profilesRouter,
  waves: wavesRouter,
  messages: messagesRouter,
  profiling: profilingRouter,
});

export type AppRouter = typeof appRouter;
