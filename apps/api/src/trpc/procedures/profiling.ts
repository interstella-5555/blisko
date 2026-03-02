import { z } from 'zod';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
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
  submitOnboardingSchema,
  answerFollowUpSchema,
  createGhostProfileSchema,
  ONBOARDING_QUESTIONS,
} from '@repo/shared';
import {
  enqueueProfilingQuestion,
  enqueueProfileFromQA,
  enqueueProfileAI,
} from '../../services/queue';
import { moderateContent } from '../../services/moderation';
import { generateFollowUpQuestions } from '../../services/profiling-ai';

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

      await moderateContent(input.answer);

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

      if (input.directionHint) {
        await moderateContent(input.directionHint);
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

      if (answeredQA.length < 3) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'At least 3 answered questions required' });
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

      await moderateContent([input.displayName, bio, lookingFor].join('\n\n'));

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

  // Submit structured onboarding answers (new flow)
  submitOnboarding: protectedProcedure
    .input(submitOnboardingSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate required questions are answered
      const answeredIds = new Set(input.answers.map((a) => a.questionId));
      const missingRequired = ONBOARDING_QUESTIONS
        .filter((q) => q.required && !answeredIds.has(q.id));
      if (missingRequired.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Missing required questions: ${missingRequired.map((q) => q.id).join(', ')}`,
        });
      }

      // Validate all questionIds are known
      const validIds = new Set(ONBOARDING_QUESTIONS.map((q) => q.id));
      for (const a of input.answers) {
        if (!validIds.has(a.questionId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown question: ${a.questionId}` });
        }
      }

      // Moderate all answers
      const allText = input.answers.map((a) => a.answer).join('\n\n');
      if (allText.trim()) {
        await moderateContent(allText);
      }

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

      // Create new session
      const [session] = await db
        .insert(profilingSessions)
        .values({ userId: ctx.userId })
        .returning();

      // Insert all standard answers as profilingQA rows
      const questionMap = new Map(ONBOARDING_QUESTIONS.map((q) => [q.id, q.question]));
      let questionNumber = 0;

      for (const a of input.answers) {
        questionNumber++;
        const questionText = questionMap.get(a.questionId) ?? a.questionId;
        await db.insert(profilingQA).values({
          sessionId: session.id,
          questionNumber,
          question: questionText,
          suggestions: [],
          answer: a.answer,
          sufficient: false,
        });
      }

      // Generate follow-up questions inline (~2-3s)
      const displayName = await getDisplayName(ctx.userId);
      const answeredQA = input.answers.map((a) => ({
        question: questionMap.get(a.questionId) ?? a.questionId,
        answer: a.answer,
      }));

      const followUps = await generateFollowUpQuestions(
        displayName,
        answeredQA,
        input.skipped
      );

      // Insert follow-up questions as additional profilingQA rows
      const followUpEntries: { id: string; question: string }[] = [];
      for (const fq of followUps.questions) {
        questionNumber++;
        const [row] = await db.insert(profilingQA).values({
          sessionId: session.id,
          questionNumber,
          question: fq,
          suggestions: [],
          answer: null,
          sufficient: false,
        }).returning({ id: profilingQA.id, question: profilingQA.question });
        followUpEntries.push(row);
      }

      return {
        sessionId: session.id,
        followUpQuestions: followUpEntries,
      };
    }),

  // Answer a follow-up question
  answerFollowUp: protectedProcedure
    .input(answerFollowUpSchema)
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

      await moderateContent(input.answer);

      // Save answer to the specific profilingQA row
      const [updated] = await db
        .update(profilingQA)
        .set({ answer: input.answer })
        .where(
          and(
            eq(profilingQA.id, input.questionId),
            eq(profilingQA.sessionId, input.sessionId)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Follow-up question not found' });
      }

      // Check if all follow-ups are answered (no null answers left)
      const unanswered = await db
        .select({ id: profilingQA.id })
        .from(profilingQA)
        .where(
          and(
            eq(profilingQA.sessionId, input.sessionId),
            sql`${profilingQA.answer} IS NULL`
          )
        );

      return { allAnswered: unanswered.length === 0 };
    }),

  // Create ghost profile (minimal, hidden)
  createGhostProfile: protectedProcedure
    .input(createGhostProfileSchema)
    .mutation(async ({ ctx, input }) => {
      await moderateContent(input.displayName);

      const [existing] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Profile already exists' });
      }

      const [profile] = await db
        .insert(profiles)
        .values({
          userId: ctx.userId,
          displayName: input.displayName,
          bio: '',
          lookingFor: '',
          visibilityMode: 'hidden',
        })
        .returning();

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
