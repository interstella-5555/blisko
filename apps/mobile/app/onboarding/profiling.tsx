import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import { useWebSocket } from '../../src/lib/ws';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { IconArrowLeft } from '../../src/components/ui/icons';

interface QAItem {
  question: string;
  suggestions: string[];
  answer: string | null;
  sufficient: boolean;
}

export default function ProfilingScreen() {
  const { setProfilingSessionId } = useOnboardingStore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QAItem[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSufficientUI, setShowSufficientUI] = useState(false);
  const [extraQuestionsRemaining, setExtraQuestionsRemaining] = useState(5);
  const [directionHint, setDirectionHint] = useState('');
  const [showDirectionInput, setShowDirectionInput] = useState(false);
  const [error, setError] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const hasStarted = useRef(false);

  const startSession = trpc.profiling.startSession.useMutation();
  const answerQuestion = trpc.profiling.answerQuestion.useMutation();
  const requestMore = trpc.profiling.requestMoreQuestions.useMutation();
  const completeSession = trpc.profiling.completeSession.useMutation();
  const getSessionState = trpc.profiling.getSessionState.useQuery(
    { sessionId: sessionId! },
    { enabled: false }
  );

  // Use ref for getSessionState to avoid recreating WS handler
  const getSessionStateRef = useRef(getSessionState);
  getSessionStateRef.current = getSessionState;

  const refreshSessionState = useCallback(() => {
    getSessionStateRef.current.refetch().then(({ data }) => {
      if (!data) return;
      const items: QAItem[] = data.questions.map((q: any) => ({
        question: q.question,
        suggestions: q.suggestions ?? [],
        answer: q.answer,
        sufficient: q.sufficient,
      }));
      setQuestions(items);
      setIsLoading(false);
      setIsSubmitting(false);

      // Check if latest question has sufficient flag
      const latest = items[items.length - 1];
      if (latest && !latest.answer && latest.sufficient) {
        setShowSufficientUI(true);
      } else {
        setShowSufficientUI(false);
      }

      // Slide in animation
      slideAnim.setValue(300);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        useNativeDriver: true,
      }).start();
    });
  }, [slideAnim]);

  // Listen for WS events
  const handleWsMessage = useCallback(
    (msg: any) => {
      if (!sessionId) return;

      if (msg.type === 'questionReady' && msg.sessionId === sessionId) {
        refreshSessionState();
      }

      if (msg.type === 'profilingComplete' && msg.sessionId === sessionId) {
        router.replace('/onboarding/profiling-result');
      }
    },
    [sessionId, refreshSessionState]
  );

  useWebSocket(handleWsMessage);

  // Timeout fallback: if WS event is missed, poll after 15s
  useEffect(() => {
    if (!isSubmitting && !isLoading) return;
    if (!sessionId) return;
    const timeout = setTimeout(() => {
      refreshSessionState();
    }, 15000);
    return () => clearTimeout(timeout);
  }, [isSubmitting, isLoading, sessionId, refreshSessionState]);

  // Start session on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    startSession.mutateAsync({}).then(({ sessionId: sid }) => {
      setSessionId(sid);
      setProfilingSessionId(sid);
    }).catch((err) => {
      console.error('Failed to start profiling session:', err);
      setIsLoading(false);
      setError('Nie udalo sie rozpoczac sesji. Sprobuj ponownie.');
    });
  }, []);

  const currentQuestion = questions.length > 0
    ? questions[questions.length - 1]
    : null;

  const answeredCount = questions.filter((q) => q.answer != null).length;

  const handleAnswer = async () => {
    if (!sessionId || !currentAnswer.trim() || isSubmitting) return;
    setIsSubmitting(true);

    const answer = currentAnswer.trim();
    setCurrentAnswer('');

    try {
      const result = await answerQuestion.mutateAsync({
        sessionId,
        answer,
      });

      if (result.done) {
        // Hard cap reached — auto-complete
        await completeSession.mutateAsync({ sessionId });
        setIsLoading(true);
      }
      // Otherwise wait for WS questionReady event
    } catch (err) {
      console.error('Failed to answer:', err);
      setIsSubmitting(false);
    }
  };

  const handleSuggestionTap = (suggestion: string) => {
    setCurrentAnswer(suggestion);
  };

  const handleRequestMore = async () => {
    if (!sessionId) return;
    setShowSufficientUI(false);
    setIsSubmitting(true);

    try {
      const result = await requestMore.mutateAsync({
        sessionId,
        directionHint: directionHint.trim() || undefined,
      });
      setExtraQuestionsRemaining(result.extraQuestionsRemaining);
      setDirectionHint('');
      setShowDirectionInput(false);
    } catch (err) {
      console.error('Failed to request more:', err);
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!sessionId) return;
    setIsLoading(true);

    try {
      await completeSession.mutateAsync({ sessionId });
      // Wait for WS profilingComplete
    } catch (err) {
      console.error('Failed to complete:', err);
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={[typ.body, { color: colors.muted, marginBottom: spacing.column, textAlign: 'center' }]}>
          {error}
        </Text>
        <Button
          title="Sprobuj ponownie"
          variant="accent"
          onPress={() => {
            setError('');
            setIsLoading(true);
            hasStarted.current = false;
            startSession.mutateAsync({}).then(({ sessionId: sid }) => {
              setSessionId(sid);
              setProfilingSessionId(sid);
            }).catch((err) => {
              console.error('Failed to start profiling session:', err);
              setIsLoading(false);
              setError('Nie udalo sie rozpoczac sesji. Sprobuj ponownie.');
            });
          }}
        />
      </View>
    );
  }

  if (isLoading && questions.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[typ.caption, { marginTop: spacing.column }]}>
          Przygotowuje pytanie...
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Button variant="ghost" onPress={() => router.back()}>
            <IconArrowLeft size={20} color={colors.accent} />
          </Button>
          <Text style={typ.caption}>
            {answeredCount} / 12
          </Text>
        </View>

        {isSubmitting || isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : currentQuestion && !currentQuestion.answer ? (
          <Animated.View
            style={[
              styles.card,
              { transform: [{ translateX: slideAnim }] },
            ]}
          >
            <ScrollView
              contentContainerStyle={styles.cardContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.question}>{currentQuestion.question}</Text>

              {currentQuestion.suggestions.length > 0 && (
                <View style={styles.suggestions}>
                  {currentQuestion.suggestions.map((s, i) => (
                    <Pressable
                      key={i}
                      style={[
                        styles.chip,
                        currentAnswer === s && styles.chipSelected,
                      ]}
                      onPress={() => handleSuggestionTap(s)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          currentAnswer === s && styles.chipTextSelected,
                        ]}
                      >
                        {s}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <TextInput
                style={styles.input}
                value={currentAnswer}
                onChangeText={setCurrentAnswer}
                placeholder="Twoja odpowiedz..."
                placeholderTextColor={colors.muted}
                multiline
                maxLength={500}
              />

              {showSufficientUI ? (
                <View style={styles.sufficientBox}>
                  <Text style={styles.sufficientText}>
                    Mam wystarczajaco duzo informacji, zeby stworzyc Twoj profil
                  </Text>

                  <Button
                    title="Zakoncz i wygeneruj profil"
                    variant="accent"
                    onPress={handleComplete}
                  />

                  {extraQuestionsRemaining > 0 && (
                    <>
                      <View style={{ marginTop: spacing.column }}>
                        <Button
                          title="Zapytaj mnie o wiecej"
                          variant="ghost"
                          onPress={() => {
                            if (showDirectionInput) {
                              handleRequestMore();
                            } else {
                              setShowDirectionInput(true);
                            }
                          }}
                        />
                      </View>

                      {showDirectionInput && (
                        <View style={{ marginTop: spacing.tight }}>
                          <TextInput
                            style={styles.directionInput}
                            value={directionHint}
                            onChangeText={setDirectionHint}
                            placeholder="O czym chcesz porozmawiac? (opcjonalnie)"
                            placeholderTextColor={colors.muted}
                            maxLength={200}
                          />
                          <Button
                            title="Wyslij"
                            variant="accent"
                            onPress={handleRequestMore}
                          />
                        </View>
                      )}

                      <Text style={[typ.caption, { textAlign: 'center', marginTop: spacing.tight }]}>
                        Mozesz dodac jeszcze {extraQuestionsRemaining}{' '}
                        {extraQuestionsRemaining === 1 ? 'pytanie' : extraQuestionsRemaining < 5 ? 'pytania' : 'pytan'}
                      </Text>
                    </>
                  )}
                </View>
              ) : (
                <View style={{ marginTop: spacing.column }}>
                  <Button
                    title="Dalej"
                    variant="accent"
                    onPress={handleAnswer}
                    disabled={!currentAnswer.trim()}
                  />
                </View>
              )}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.section,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.column,
  },
  card: {
    flex: 1,
  },
  cardContent: {
    paddingBottom: spacing.block,
  },
  question: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginBottom: spacing.section,
    lineHeight: 30,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.tight,
    marginBottom: spacing.section,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: spacing.tight,
    paddingHorizontal: spacing.gutter,
    borderRadius: 0,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chipText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingVertical: 12,
    minHeight: 80,
  },
  sufficientBox: {
    marginTop: spacing.section,
    gap: spacing.tight,
  },
  sufficientText: {
    ...typ.body,
    textAlign: 'center',
    marginBottom: spacing.column,
    color: colors.muted,
  },
  directionInput: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    paddingVertical: 8,
    marginBottom: spacing.tight,
  },
});
