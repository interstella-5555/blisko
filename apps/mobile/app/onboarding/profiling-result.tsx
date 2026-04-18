import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import { Button } from "@/components/ui/Button";
import { ThinkingIndicator } from "@/components/ui/ThinkingIndicator";
import { useRetryProfileOnFailure } from "@/hooks/useRetryProfileOnFailure";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

export default function ProfilingResultScreen() {
  const { profilingSessionId, displayName, complete } = useOnboardingStore();
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHasCheckedProfile = useAuthStore((s) => s.setHasCheckedProfile);

  const [bio, setBio] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(true);

  // Redirect if no session (e.g., direct navigation or app restart)
  useEffect(() => {
    if (!profilingSessionId) {
      router.replace("/onboarding");
    }
  }, [profilingSessionId]);

  const sessionState = trpc.profiling.getSessionState.useQuery(
    { sessionId: profilingSessionId! },
    { enabled: !!profilingSessionId },
  );

  const applyProfile = trpc.profiling.applyProfile.useMutation();

  // Load generated profile data when session completes
  useEffect(() => {
    if (sessionState.data?.session) {
      const s = sessionState.data.session;
      if (s.generatedBio && s.generatedLookingFor) {
        setBio(s.generatedBio);
        setLookingFor(s.generatedLookingFor);
        setIsGenerating(false);
      }
    }
  }, [sessionState.data]);

  // Listen for WS event when profile generation completes
  const handleWsMessage = useCallback(
    (msg: WSMessage) => {
      if (!profilingSessionId) return;
      if (msg.type === "profilingComplete" && msg.sessionId === profilingSessionId) {
        sessionState.refetch();
      }
    },
    [profilingSessionId, sessionState],
  );

  useWebSocket(handleWsMessage);
  useRetryProfileOnFailure(profilingSessionId ?? null);

  // Fallback polling: refetch every 5s while generating
  useEffect(() => {
    if (!isGenerating || !profilingSessionId) return;
    const interval = setInterval(() => {
      sessionState.refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [isGenerating, profilingSessionId, sessionState]);

  const handleApply = async () => {
    if (!profilingSessionId) return;
    setIsSubmitting(true);
    setError("");

    try {
      const profile = await applyProfile.mutateAsync({
        sessionId: profilingSessionId,
        displayName,
        bio: bio.trim() || undefined,
        lookingFor: lookingFor.trim() || undefined,
      });
      setProfile(profile);
      setHasCheckedProfile(true);
      complete();
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 100);
    } catch (err) {
      console.error("Failed to apply profile:", err);
      setError("Nie udało się zapisać profilu. Spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show generating indicator while waiting for AI
  if (isGenerating) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen
          options={{
            headerShown: true,
            header: () => <OnboardingStepHeader label="Ostatni krok" />,
          }}
        />
        <ThinkingIndicator
          messages={["Generuję Twój profil...", "Analizuję Twoje odpowiedzi...", "Jeszcze chwilka..."]}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      testID="profiling-review-screen"
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          header: () => <OnboardingStepHeader label="Ostatni krok" />,
        }}
      />
      <OnboardingScreen
        footer={
          <>
            <Text style={styles.footnote}>Możesz edytować zanim przejdziesz do aplikacji</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              testID="confirm-profile-button"
              title="Tak, to ja"
              variant="accent"
              onPress={handleApply}
              disabled={isSubmitting || bio.trim().length < 10 || lookingFor.trim().length < 10}
              loading={isSubmitting}
            />
          </>
        }
      >
        <Text style={styles.title}>Oto jak Cię widzę</Text>

        <Text style={styles.label}>O MNIE</Text>
        <TextInput
          testID="bio-input"
          style={styles.input}
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
          spellCheck={false}
          autoCorrect={false}
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.charCount}>{bio.length} / 500</Text>

        <Text style={styles.label}>KOGO SZUKAM</Text>
        <TextInput
          testID="looking-for-input"
          style={styles.input}
          value={lookingFor}
          onChangeText={setLookingFor}
          multiline
          maxLength={500}
          spellCheck={false}
          autoCorrect={false}
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.charCount}>{lookingFor.length} / 500</Text>
      </OnboardingScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...typ.display,
    marginBottom: spacing.tight,
  },
  label: {
    ...typ.label,
    marginBottom: spacing.tight,
    marginTop: spacing.column,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingVertical: 12,
  },
  charCount: {
    ...typ.caption,
    textAlign: "right",
    marginTop: spacing.hairline,
  },
  error: {
    fontFamily: fonts.sans,
    color: colors.status.error.text,
    fontSize: 14,
    textAlign: "center",
  },
  footnote: {
    ...typ.caption,
    color: colors.muted,
    textAlign: "center",
  },
});
