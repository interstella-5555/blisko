import { router } from "../trpc";
import { conversationsRouter } from "./conversations";
import { groupsRouter } from "./groups";
import { matchingRouter } from "./matching";
import { queueRouter } from "./queue";
import { usersRouter } from "./users";
import { wavesRouter } from "./waves";

export const appRouter = router({
  conversations: conversationsRouter,
  groups: groupsRouter,
  matching: matchingRouter,
  queue: queueRouter,
  users: usersRouter,
  waves: wavesRouter,
});

export type AppRouter = typeof appRouter;
