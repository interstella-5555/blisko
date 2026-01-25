import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { auth } from './auth';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['http://localhost:8081', 'exp://localhost:8081', 'meet://'],
    credentials: true,
  })
);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Better Auth handler
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw);
});

// Dev-only: Auto-login for @example.com emails (bypasses magic link)
// Enable with ENABLE_DEV_LOGIN=true for testing on staging/production
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_LOGIN === 'true') {
  app.post('/dev/auto-login', async (c) => {
    try {
      const { email } = await c.req.json();

      if (!email?.endsWith('@example.com')) {
        return c.json({ error: 'Only @example.com emails allowed' }, 400);
      }

      const { db } = await import('./db');
      const { user, session } = await import('./db/schema');
      const { eq } = await import('drizzle-orm');

      // Find or create user
      let [existingUser] = await db
        .select()
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      if (!existingUser) {
        // Create new user
        [existingUser] = await db
          .insert(user)
          .values({
            id: crypto.randomUUID(),
            email,
            name: email.split('@')[0],
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
      }

      // Create session
      const sessionToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const [newSession] = await db
        .insert(session)
        .values({
          id: crypto.randomUUID(),
          userId: existingUser.id,
          token: sessionToken,
          expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return c.json({
        user: existingUser,
        session: newSession,
        token: sessionToken,
      });
    } catch (error) {
      console.error('Auto-login error:', error);
      return c.json({ error: 'Failed to auto-login', details: String(error) }, 500);
    }
  });
}

// tRPC
app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    createContext,
  })
);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

const port = Number(process.env.PORT) || 3000;

console.log(`🚀 Server starting on port ${port}`);

// Bun runtime
export default {
  port,
  fetch: app.fetch,
};

export { app };
