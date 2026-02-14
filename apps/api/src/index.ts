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
    origin: ['http://localhost:8081', 'exp://localhost:8081', 'blisko://'],
    credentials: true,
  })
);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug: Check recent verifications (dev only)
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_LOGIN === 'true') {
  app.get('/dev/verifications', async (c) => {
    const { db } = await import('./db');
    const { verification } = await import('./db/schema');
    const { desc } = await import('drizzle-orm');

    const verifications = await db
      .select()
      .from(verification)
      .orderBy(desc(verification.createdAt))
      .limit(5);

    return c.json(verifications);
  });
}

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

// File uploads — S3-compatible object storage (Bun built-in S3Client)
import { S3Client } from 'bun';

const s3 = new S3Client({
  accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
  secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
  endpoint: process.env.BUCKET_ENDPOINT!,
  bucket: process.env.BUCKET_NAME!,
});

app.post('/uploads', async (c) => {
  try {
    // Verify auth
    const authHeader = c.req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: 'File too large (max 5MB)' }, 400);
    }

    // Validate type
    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'Only images allowed' }, 400);
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const key = `uploads/${crypto.randomUUID()}.${ext}`;

    const buffer = await file.arrayBuffer();
    await s3.write(key, buffer, { type: file.type });

    // Generate a presigned URL for reading (7 days)
    const url = s3.presign(key, {
      expiresIn: 7 * 24 * 60 * 60,
    });

    return c.json({ url, key });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

app.get('/uploads/:key', async (c) => {
  const key = c.req.param('key');
  if (key.includes('..')) {
    return c.json({ error: 'Invalid key' }, 400);
  }

  try {
    const file = s3.file(`uploads/${key}`);
    const url = file.presign({ expiresIn: 7 * 24 * 60 * 60 });
    return c.redirect(url);
  } catch {
    return c.json({ error: 'File not found' }, 404);
  }
});

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

// Start BullMQ worker for connection analysis
import { startWorker } from './services/queue';
startWorker();

const port = Number(process.env.PORT) || 3000;

console.log(`🚀 Server starting on port ${port}`);

// Import WebSocket handler
import { wsHandler } from './ws/handler';

// Bun runtime with WebSocket support
export default {
  port,
  fetch(req: Request, server: any) {
    // WebSocket upgrade for /ws path
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req, {
        data: { userId: null, subscriptions: new Set() },
      });
      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Regular HTTP handled by Hono
    return app.fetch(req, server);
  },
  websocket: wsHandler,
};

export { app };
