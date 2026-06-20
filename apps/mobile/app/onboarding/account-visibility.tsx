import { Trans, useLingui } from "@lingui/react/macro";
import type { StatusCategory, VisibilityMode } from "@repo/shared";
import { router, Stack } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DotsProgress } from "@/components/onboarding/DotsProgress";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import { Button } from "@/components/ui/Button";
import { ThinkingIndicator } from "@/components/ui/ThinkingIndicator";
import { isRateLimitError } from "@/lib/globalErrorHandler";
import { trpc, vanillaClient } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

// Poll generated profile until ready, then resolve. Belt-and-braces alongside
// the WS `profilingComplete` event (which can be missed if the socket dropped).
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90_000;

export default function AccountVisibilityScreen() {
  const { t } = useLingui();
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHasCheckedProfile = useAuthStore((s) => s.setHasCheckedProfile);

  const VISIBILITY_OPTIONS: { key: VisibilityMode; emoji: string; name: string; desc: string }[] = [
    { key: "ninja", emoji: "🥷", name: "Ninja", desc: t`Widzisz innych, ale Ciebie nie widać. Nie pingujesz.` },
    { key: "semi_open", emoji: "🟢", name: "Semi-Open", desc: t`Widoczny na mapie. Pingujesz i jesteś pingowany.` },
    { key: "full_nomad", emoji: "🟢", name: "Open", desc: t`Widoczny i otwarty — „Podejdź śmiało" w profilu.` },
  ];

  const [mode, setMode] = useState<VisibilityMode>(useOnboardingStore.getState().visibilityMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Category → user-facing label, resolved here where the Lingui macro is in scope.
  const categoryLabels: Record<StatusCategory, string> = {
    project: t`projekt`,
    networking: t`networking`,
    dating: t`randka`,
    casual: t`luźne wyjście`,
  };
  const labelsFor = (categories: StatusCategory[]) => categories.map((c) => categoryLabels[c]).join(", ");

  const submitOnboarding = trpc.profiling.submitOnboarding.useMutation();
  const completeSession = trpc.profiling.completeSession.useMutation();
  const applyProfile = trpc.profiling.applyProfile.useMutation();
  const setStatus = trpc.profiles.setStatus.useMutation();

  // The active session id we are polling generation for. Set once submit returns.
  const activeSessionId = useRef<string | null>(null);

  // WS push: if generation completes while we're waiting, the poll below will
  // also catch it — this just makes it snappier on a healthy socket.
  const handleWsMessage = useCallback((msg: WSMessage) => {
    if (msg.type === "profilingComplete" && msg.sessionId === activeSessionId.current) {
      // The poll loop reads getSessionState directly; nothing to do here beyond
      // letting the next tick pick it up faster.
    }
  }, []);
  useWebSocket(handleWsMessage);

  const waitForGeneration = async (sessionId: string): Promise<{ bio: string; lookingFor: string }> => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = await vanillaClient.profiling.getSessionState.query({ sessionId });
      const s = state.session;
      if (s.generatedBio && s.generatedLookingFor) {
        return { bio: s.generatedBio, lookingFor: s.generatedLookingFor };
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("PROFILE_GENERATION_TIMEOUT");
  };

  const handleGoToMap = async () => {
    setSubmitting(true);
    setError("");

    const store = useOnboardingStore.getState();
    store.setVisibilityMode(mode);

    const introAnswer = store.answers.intro?.trim();
    if (!introAnswer) {
      // Defensive: should never happen — step 1 gates on it. Bounce back.
      setSubmitting(false);
      router.replace("/onboarding");
      return;
    }

    // Synthesize a "looking for" answer from the category step so the AI
    // portrait has a second real signal and reads the user's intent.
    const lookingForText = [labelsFor(store.statusCategories), store.statusText.trim()].filter(Boolean).join(" — ");

    try {
      const submitResult = await submitOnboarding.mutateAsync({
        answers: [
          { questionId: "intro", answer: introAnswer },
          ...(lookingForText ? [{ questionId: "looking_for", answer: lookingForText }] : []),
        ],
        skipped: [],
        skipFollowUps: true,
      });
      activeSessionId.current = submitResult.sessionId;
      store.setProfilingSessionId(submitResult.sessionId);

      await completeSession.mutateAsync({ sessionId: submitResult.sessionId });
      const { bio, lookingFor } = await waitForGeneration(submitResult.sessionId);

      const profile = await applyProfile.mutateAsync({
        sessionId: submitResult.sessionId,
        displayName: store.displayName,
        bio,
        lookingFor,
        visibilityMode: mode,
        avatarUrl: store.avatarUrl ?? undefined,
      });
      setProfile(profile);
      setHasCheckedProfile(true);

      // Set the "na teraz" status from the category step. Non-fatal if it fails —
      // the user lands on the map either way and can set it from there.
      if (store.statusCategories.length > 0) {
        const statusText = store.statusText.trim() || labelsFor(store.statusCategories);
        try {
          const withStatus = await setStatus.mutateAsync({
            text: statusText,
            categories: store.statusCategories,
          });
          if (withStatus) setProfile(withStatus);
        } catch (statusErr) {
          console.warn("[onboarding] setStatus failed, continuing to map:", statusErr);
        }
      }

      store.complete();
      setTimeout(() => router.replace("/(tabs)"), 100);
    } catch (err) {
      if (isRateLimitError(err)) {
        setSubmitting(false);
        return; // global handler shows localized toast
      }
      console.error("[onboarding] Failed to finish onboarding:", err);
      setError(t`Nie udało się dokończyć. Spróbuj ponownie.`);
      setSubmitting(false);
    }
  };

  if (submitting && !error) {
    return (
      <View style={styles.generatingWrap}>
        <Stack.Screen options={{ headerShown: false }} />
        <ThinkingIndicator messages={[t`Tworzę Twój profil…`, t`Analizuję, co napisałeś…`, t`Już prawie na mapie…`]} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ header: () => <OnboardingStepHeader label="" onBack={() => router.back()} /> }} />
      <OnboardingScreen
        footer={
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              testID="onboarding-go-to-map"
              title={t`Na mapę`}
              variant="accent"
              onPress={handleGoToMap}
              loading={submitting}
              disabled={submitting}
            />
          </>
        }
      >
        <DotsProgress count={3} active={2} />

        <Text style={styles.title}>
          <Trans>Jak chcesz być widoczny?</Trans>
        </Text>
        <Text style={styles.subtitle}>
          <Trans>Zmienisz to w każdej chwili w ustawieniach.</Trans>
        </Text>

        <View style={styles.options}>
          {VISIBILITY_OPTIONS.map((opt) => {
            const isSel = mode === opt.key;
            return (
              <Pressable
                key={opt.key}
                testID={`onboarding-visibility-${opt.key}`}
                style={[styles.option, isSel && styles.optionSelected]}
                onPress={() => setMode(opt.key)}
              >
                <View style={[styles.radio, isSel && styles.radioSelected]}>
                  {isSel && <View style={styles.radioDot} />}
                </View>
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionName, !isSel && styles.dim]}>
                    {opt.emoji} {opt.name}
                  </Text>
                  <Text style={[styles.optionDesc, !isSel && styles.dim]}>{opt.desc}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </OnboardingScreen>
    </>
  );
}

const styles = StyleSheet.create({
  generatingWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typ.display,
    marginBottom: spacing.tight,
  },
  subtitle: {
    ...typ.body,
    color: colors.muted,
    marginBottom: spacing.section,
  },
  options: {
    gap: spacing.gutter,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.gutter,
    padding: spacing.column,
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 14,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(192,57,43,0.06)",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  optionInfo: {
    flex: 1,
  },
  optionName: {
    ...typ.body,
    fontFamily: fonts.sansMedium,
    marginBottom: 2,
  },
  optionDesc: {
    ...typ.caption,
    color: colors.muted,
    lineHeight: 18,
  },
  dim: {
    opacity: 0.55,
  },
  error: {
    ...typ.body,
    color: colors.status.error.text,
    textAlign: "center",
  },
});
