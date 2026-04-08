import { router } from "../trpc";
import { conversationsRouter } from "./conversations";
import { groupsRouter } from "./groups";
import { matchingRouter } from "./matching";
import { usersRouter } from "./users";
import { wavesRouter } from "./waves";

export const appRouter = router({
  conversations: conversationsRouter,
  groups: groupsRouter,
  matching: matchingRouter,
  users: usersRouter,
  waves: wavesRouter,
});

export type AppRouter = typeof appRouter;
