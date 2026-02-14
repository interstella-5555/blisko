import { z } from 'zod';
import { eq, and, asc, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import { profiles, profilingSessions, profilingQA } from '../../db/schema';
import {
  startProfilingSchema,
  answerQuestionSchema,
  requestMoreQuestionsSchema,
  completeProfilingSchema,
  applyProfilingSchema,
} from '@repo/shared';
import {
  enqueueProfilingQuestion,
  enqueueProfileFromQA,
  enqueueProfileAI,
} from '../../services/queue';

// --- Helpers ---

async function loadAnsweredQA(sessionId: string): Promise<{ question: string; answer: string }[]> {
  const qa = await db
    .select({ question: profilingQA.question, answer: profilingQA.answer })
    .from(profilingQA)
    .where(eq(profilingQA.sessionId, sessionId))
    .orderBy(asc(profilingQA.questionNumber));

  return qa
    .filter((row) => row.answer != null)
    .map((row) => ({ question: row.question, answer: row.answer! }));
}

async function loadPreviousSessionQA(
  session: { basedOnSessionId: string | null }
): Promise<{ question: string; answer: string }[] | undefined> {
  if (!session.basedOnSessionId) return undefined;
  return loadAnsweredQA(session.basedOnSessionId);
}

async function getDisplayName(userId: string): Promise<string> {
  const [profile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return profile?.displayName ?? 'Uzytkownik';
}

// --- Router ---

export const profilingRouter = router({
  // Start a new profiling session
  startSession: protectedProcedure
    .input(startProfilingSchema)
    .mutation(async ({ ctx, input }) => {
      // Abandon any existing active session
      await db
        .update(profilingSessions)
        .set({ status: 'abandoned' })
        .where(
          and(
            eq(profilingSessions.userId, ctx.userId),
            eq(profilingSessions.status, 'active')
          )
        );

      // Validate basedOnSessionId ownership
      if (input.basedOnSessionId) {
        const [prevSession] = await db
          .select({ id: profilingSessions.id })
          .from(profilingSessions)
          .where(
            and(
              eq(profilingSessions.id, input.basedOnSessionId),
              eq(profilingSessions.userId, ctx.userId)
            )
          );
        if (!prevSession) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Previous session not found' });
        }
      }

      // Create new session
      const [session] = await db
        .insert(profilingSessions)
        .values({
          userId: ctx.userId,
          basedOnSessionId: input.basedOnSessionId ?? null,
        })
        .returning();

      const previousSessionQA = await loadPreviousSessionQA(session);
      const displayName = await getDisplayName(ctx.userId);

      // Enqueue first question
      await enqueueProfilingQuestion(
        session.id,
        ctx.userId,
        displayName,
        [],
        { previousSessionQA }
      );

      return { sessionId: session.id };
    }),

  // Answer the current question
  answerQuestion: protectedProcedure
    .input(answerQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(profilingSessions)
        .where(
          and(
            eq(profilingSessions.id, input.sessionId),
            eq(profilingSessions.userId, ctx.userId),
            eq(profilingSessions.status, 'active')
          )
        );

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found or not active' });
      }

      // Get latest unanswered question
      const [latestQ] = await db
        .select()
        .from(profilingQA)
        .where(eq(profilingQA.sessionId, input.sessionId))
        .orderBy(desc(profilingQA.questionNumber))
        .limit(1);

      if (!latestQ || latestQ.answer != null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No unanswered question' });
      }

      // Save answer
      await db
        .update(profilingQA)
        .set({ answer: input.answer })
        .where(eq(profilingQA.id, latestQ.id));

      // Build full QA history
      const answeredQA = await loadAnsweredQA(input.sessionId);

      // Hard cap: 12 questions
      if (answeredQA.length >= 12) {
        return { questionNumber: answeredQA.length, done: true };
      }

      const previousSessionQA = await loadPreviousSessionQA(session);
      const displayName = await getDisplayName(ctx.userId);

      // Enqueue next question
      await enqueueProfilingQuestion(
        input.sessionId,
        ctx.userId,
        displayName,
        answeredQA,
        { previousSessionQA }
      );

      return { questionNumber: answeredQA.length, done: false };
    }),

  // Request more questions after AI said sufficient
  requestMoreQuestions: protectedProcedure
    .input(requestMoreQuestionsSchema)
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(profilingSessions)
        .where(
          and(
            eq(profilingSessions.id, input.sessionId),
            eq(profilingSessions.userId, ctx.userId),
            eq(profilingSessions.status, 'active')
          )
        );

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found or not active' });
      }

      // Ensure latest question is answered before requesting more
      const [latestQ] = await db
        .select({ answer: profilingQA.answer })
        .from(profilingQA)
        .where(eq(profilingQA.sessionId, input.sessionId))
        .orderBy(desc(profilingQA.questionNumber))
        .limit(1);

      if (latestQ && latestQ.answer == null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Answer the current question first' });
      }

      // Count questions after first sufficient: true
      const allQA = await db
        .select({
          sufficient: profilingQA.sufficient,
          answer: profilingQA.answer,
          question: profilingQA.question,
        })
        .from(profilingQA)
        .where(eq(profilingQA.sessionId, input.sessionId))
        .orderBy(asc(profilingQA.questionNumber));

      let firstSufficientIdx = -1;
      for (let i = 0; i < allQA.length; i++) {
        if (allQA[i].sufficient) {
          firstSufficientIdx = i;
          break;
        }
      }

      const extraQuestions = firstSufficientIdx >= 0
        ? allQA.length - firstSufficientIdx - 1
        : 0;

      if (extraQuestions >= 5) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Maximum extra questions reached' });
      }

      const answeredQA = allQA
        .filter((qa) => qa.answer != null)
        .map((qa) => ({ question: qa.question, answer: qa.answer! }));

      const previousSessionQA = await loadPreviousSessionQA(session);
      const displayName = await getDisplayName(ctx.userId);

      await enqueueProfilingQuestion(
        input.sessionId,
        ctx.userId,
        displayName,
        answeredQA,
        {
          previousSessionQA,
          userRequestedMore: true,
          directionHint: input.directionHint,
        }
      );

      return { extraQuestionsRemaining: 5 - extraQuestions - 1 };
    }),

  // Complete session and generate profile
  completeSession: protectedProcedure
    .input(completeProfilingSchema)
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(profilingSessions)
        .where(
          and(
            eq(profilingSessions.id, input.sessionId),
            eq(profilingSessions.userId, ctx.userId),
            eq(profilingSessions.status, 'active')
          )
        );

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found or not active' });
      }

      // Ensure no unanswered questions remain
      const allQA = await db
        .select({ question: profilingQA.question, answer: profilingQA.answer })
        .from(profilingQA)
        .where(eq(profilingQA.sessionId, input.sessionId))
        .orderBy(asc(profilingQA.questionNumber));

      const unanswered = allQA.filter((qa) => qa.answer == null);
      if (unanswered.length > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Answer all questions before completing' });
      }

      const answeredQA = allQA.map((qa) => ({ question: qa.question, answer: qa.answer! }));

      if (answeredQA.length < 5) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'At least 5 answered questions required' });
      }

      const previousSessionQA = await loadPreviousSessionQA(session);
      const displayName = await getDisplayName(ctx.userId);

      await enqueueProfileFromQA(
        input.sessionId,
        ctx.userId,
        displayName,
        answeredQA,
        previousSessionQA
      );

      return { status: 'generating' as const };
    }),

  // Get current session state (for rebuilding UI after reconnect)
  getSessionState: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(profilingSessions)
        .where(
          and(
            eq(profilingSessions.id, input.sessionId),
            eq(profilingSessions.userId, ctx.userId)
          )
        );

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const questions = await db
        .select()
        .from(profilingQA)
        .where(eq(profilingQA.sessionId, input.sessionId))
        .orderBy(asc(profilingQA.questionNumber));

      return { session, questions };
    }),

  // Apply generated profile from a completed session
  applyProfile: protectedProcedure
    .input(applyProfilingSchema)
    .mutation(async ({ ctx, input }) => {
      const [session] = await db
        .select()
        .from(profilingSessions)
        .where(
          and(
            eq(profilingSessions.id, input.sessionId),
            eq(profilingSessions.userId, ctx.userId),
            eq(profilingSessions.status, 'completed')
          )
        );

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Completed session not found' });
      }

      if (!session.generatedBio || !session.generatedLookingFor) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Profile not yet generated' });
      }

      // Allow user edits to override generated text
      const bio = input.bio ?? session.generatedBio;
      const lookingFor = input.lookingFor ?? session.generatedLookingFor;

      // Check if profile exists — create or update
      const [existing] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      let profile;
      if (existing) {
        [profile] = await db
          .update(profiles)
          .set({
            displayName: input.displayName,
            bio,
            lookingFor,
            portrait: session.generatedPortrait,
            portraitSharedForMatching: input.portraitSharedForMatching,
            updatedAt: new Date(),
          })
          .where(eq(profiles.userId, ctx.userId))
          .returning();
      } else {
        [profile] = await db
          .insert(profiles)
          .values({
            userId: ctx.userId,
            displayName: input.displayName,
            bio,
            lookingFor,
            portrait: session.generatedPortrait,
            portraitSharedForMatching: input.portraitSharedForMatching,
          })
          .returning();
      }

      // Enqueue AI pipeline (socialProfile + embedding + interests)
      enqueueProfileAI(ctx.userId, profile.bio, profile.lookingFor).catch((err) => {
        console.error('[profiling] Failed to enqueue profile AI job:', err);
      });

      return profile;
    }),

  // List all sessions for this user
  getSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await db
      .select()
      .from(profilingSessions)
      .where(eq(profilingSessions.userId, ctx.userId))
      .orderBy(desc(profilingSessions.createdAt));

    return sessions;
  }),
});
