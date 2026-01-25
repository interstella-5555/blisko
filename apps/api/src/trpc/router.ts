import { router } from './trpc';
import { profilesRouter } from './procedures/profiles';
import { wavesRouter } from './procedures/waves';
import { messagesRouter } from './procedures/messages';

export const appRouter = router({
  profiles: profilesRouter,
  waves: wavesRouter,
  messages: messagesRouter,
});

export type AppRouter = typeof appRouter;
