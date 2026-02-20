import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Pressable,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { ONBOARDING_QUESTIONS } from '@repo/shared';
import { trpc } from '../../src/lib/trpc';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { ThinkingIndicator } from '../../src/components/ui/ThinkingIndicator';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Phase = 'questions' | 'submitting' | 'followups' | 'generating';

interface FollowUp {
  id: string;
  question: string;
}

export default function ProfilingModal() {
  const { setProfilingSessionId } = useOnboardingStore();

  const [questionIndex, setQuestionIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('questions');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [followUpIndex, setFollowUpIndex] = useState(0);
  const [followUpText, setFollowUpText] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  const submitOnboarding = trpc.profiling.submitOnboarding.useMutation();
  const answerFollowUp = trpc.profiling.answerFollowUp.useMutation();
  const completeSession = trpc.profiling.completeSession.useMutation();

  const totalQuestions = ONBOARDING_QUESTIONS.length;
  const currentQuestion = ONBOARDING_QUESTIONS[questionIndex];

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 350);
    return () => clearTimeout(timer);
  }, [questionIndex, followUpIndex, phase]);

  const animateSlide = (direction: 'forward' | 'back', callback: () => void) => {
    const toValue = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH;
    Animated.timing(slideAnim, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      callback();
      slideAnim.setValue(direction === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    const trimmed = currentText.trim();
    if (!trimmed && currentQuestion.required) return;

    const newAnswers = trimmed
      ? { ...answers, [currentQuestion.id]: trimmed }
      : answers;
    setAnswers(newAnswers);

    if (questionIndex < totalQuestions - 1) {
      animateSlide('forward', () => {
        setQuestionIndex((i) => i + 1);
        setCurrentText('');
      });
    } else {
      handleSubmitAll(newAnswers);
    }
  };

  const handleSkip = () => {
    if (!currentQuestion) return;

    if (questionIndex < totalQuestions - 1) {
      animateSlide('forward', () => {
        setQuestionIndex((i) => i + 1);
        setCurrentText('');
      });
    } else {
      handleSubmitAll(answers);
    }
  };

  const handleBack = () => {
    if (questionIndex > 0) {
      animateSlide('back', () => {
        const prev = ONBOARDING_QUESTIONS[questionIndex - 1];
        setQuestionIndex((i) => i - 1);
        setCurrentText(prev ? answers[prev.id] ?? '' : '');
      });
    } else {
      router.back();
    }
  };

  const handleSubmitAll = async (finalAnswers: Record<string, string>) => {
    setPhase('submitting');
    setError('');

    const answersArray = Object.entries(finalAnswers)
      .filter(([, v]) => v.trim())
      .map(([questionId, answer]) => ({ questionId, answer }));

    const answeredIds = new Set(answersArray.map((a) => a.questionId));
    const allSkipped = ONBOARDING_QUESTIONS
      .map((q) => q.id)
      .filter((id) => !answeredIds.has(id));

    try {
      const result = await submitOnboarding.mutateAsync({
        answers: answersArray,
        skipped: allSkipped,
      });

      setSessionId(result.sessionId);
      setProfilingSessionId(result.sessionId);

      if (result.followUpQuestions.length > 0) {
        setFollowUps(result.followUpQuestions);
        setFollowUpIndex(0);
        setFollowUpText('');
        setPhase('followups');
      } else {
        await triggerProfileGeneration(result.sessionId);
      }
    } catch (err) {
      console.error('Failed to submit:', err);
      setError('Nie udało się przesłać odpowiedzi. Spróbuj ponownie.');
      setPhase('questions');
    }
  };

  const handleFollowUpNext = async () => {
    const trimmed = followUpText.trim();
    if (!trimmed) return;

    const currentFollowUp = followUps[followUpIndex];
    if (!currentFollowUp || !sessionId) return;

    setError('');

    try {
      await answerFollowUp.mutateAsync({
        sessionId,
        questionId: currentFollowUp.id,
        answer: trimmed,
      });

      if (followUpIndex < followUps.length - 1) {
        animateSlide('forward', () => {
          setFollowUpIndex((i) => i + 1);
          setFollowUpText('');
        });
      } else {
        await triggerProfileGeneration(sessionId);
      }
    } catch (err) {
      console.error('Failed to answer follow-up:', err);
      setError('Nie udało się zapisać odpowiedzi. Spróbuj ponownie.');
    }
  };

  const triggerProfileGeneration = async (sid: string) => {
    setPhase('generating');
    try {
      await completeSession.mutateAsync({ sessionId: sid });
      router.replace('/(modals)/profiling-result');
    } catch (err) {
      console.error('Failed to complete session:', err);
      setError('Nie udało się wygenerować profilu. Spróbuj ponownie.');
    }
  };

  // --- Submitting ---
  if (phase === 'submitting') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ThinkingIndicator messages={['Analizuję Twoje odpowiedzi…']} />
      </View>
    );
  }

  // --- Generating (with error retry) ---
  if (phase === 'generating') {
    return (
      <View style={[styles.container, styles.centered]}>
        {error ? (
          <View style={styles.errorRetry}>
            <Text style={styles.error}>{error}</Text>
            <View style={{ marginTop: spacing.column }}>
              <Button
                title="Spróbuj ponownie"
                variant="accent"
                onPress={() => {
                  setError('');
                  if (sessionId) triggerProfileGeneration(sessionId);
                }}
              />
            </View>
          </View>
        ) : (
          <ThinkingIndicator
            messages={[
              'Generuję Twój profil…',
              'Analizuję Twoje odpowiedzi…',
              'Jeszcze chwilka…',
            ]}
          />
        )}
      </View>
    );
  }

  // --- Follow-ups ---
  if (phase === 'followups') {
    const currentFU = followUps[followUpIndex];
    if (!currentFU) return null;

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: '100%' }]} />
        </View>

        <Animated.View
          style={[styles.content, { transform: [{ translateX: slideAnim }] }]}
        >
          <View style={styles.header}>
            <View />
            <Text style={styles.counter}>
              Jeszcze {followUps.length - followUpIndex}{' '}
              {followUps.length - followUpIndex === 1 ? 'pytanie' : 'pytania'}
            </Text>
          </View>

          <Text style={styles.questionText}>{currentFU.question}</Text>

          <TextInput
            ref={inputRef}
            style={styles.input}
            value={followUpText}
            onChangeText={setFollowUpText}
            placeholder="Twoja odpowiedź"
            placeholderTextColor={colors.muted}
            spellCheck={false}
            autoCorrect={false}
            multiline
            maxLength={500}
            autoFocus
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button
              title="Dalej"
              variant="accent"
              onPress={handleFollowUpNext}
              disabled={!followUpText.trim() || answerFollowUp.isPending}
              loading={answerFollowUp.isPending}
            />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    );
  }

  // --- Standard questions ---
  if (!currentQuestion) return null;

  const progress = (questionIndex + 1) / totalQuestions;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
      </View>

      <Animated.View
        style={[styles.content, { transform: [{ translateX: slideAnim }] }]}
      >
        <View style={styles.header}>
          <Pressable onPress={handleBack} hitSlop={16}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.counter}>
            {questionIndex + 1} / {totalQuestions}
          </Text>
        </View>

        <Text style={styles.questionText}>{currentQuestion.question}</Text>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={currentText}
          onChangeText={setCurrentText}
          placeholder="Twoja odpowiedź"
          placeholderTextColor={colors.muted}
          spellCheck={false}
          autoCorrect={false}
          multiline
          maxLength={500}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button
            title="Dalej"
            variant="accent"
            onPress={handleNext}
            disabled={!currentText.trim() && currentQuestion.required}
          />
          {!currentQuestion.required && (
            <Pressable onPress={handleSkip} hitSlop={8}>
              <Text style={styles.skipText}>Pomiń</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarBg: {
    height: 3,
    backgroundColor: colors.rule,
    width: '100%',
  },
  progressBarFill: {
    height: 3,
    backgroundColor: colors.accent,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.section,
    paddingTop: spacing.block,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.block,
  },
  backArrow: {
    fontSize: 24,
    color: colors.ink,
  },
  counter: {
    ...typ.caption,
  },
  questionText: {
    ...typ.heading,
    marginBottom: spacing.section,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingVertical: 12,
    paddingHorizontal: 0,
    minHeight: 48,
  },
  actions: {
    marginTop: spacing.section,
    gap: spacing.column,
    alignItems: 'center',
  },
  skipText: {
    ...typ.caption,
    color: colors.muted,
  },
  error: {
    ...typ.body,
    color: colors.status.error.text,
    textAlign: 'center',
    marginTop: spacing.column,
  },
  errorRetry: {
    alignItems: 'center',
    paddingHorizontal: spacing.section,
  },
});
