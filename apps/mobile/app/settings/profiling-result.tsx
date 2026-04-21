import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { ThinkingIndicator } from "@/components/ui/ThinkingIndicator";
import { useRetryProfileOnFailure } from "@/hooks/useRetryProfileOnFailure";
import { trpc } from "@/lib/trpc";
import { useWebSocket, type WSMessage } from "@/lib/ws";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

export default function ProfilingResultModal() {
  const { profilingSessionId } = useOnboardingStore();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [bio, setBio] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(true);

  const utils = trpc.useUtils();
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

  // Fallback polling every 5s while generating
  useEffect(() => {
    if (!isGenerating || !profilingSessionId) return;
    const interval = setInterval(() => {
      sessionState.refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [isGenerating, profilingSessionId, sessionState]);

  const handleApply = async () => {
    if (!profilingSessionId || !profile) return;
    setIsSubmitting(true);
    setError("");

    try {
      const updated = await applyProfile.mutateAsync({
        sessionId: profilingSessionId,
        displayName: profile.displayName,
        bio: bio.trim() || undefined,
        lookingFor: lookingFor.trim() || undefined,
      });
      setProfile(updated);
      utils.profiles.me.invalidate();
      router.dismiss();
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
        <ThinkingIndicator
          messages={["Generuję Twój profil...", "Analizuję Twoje odpowiedzi...", "Jeszcze chwilka..."]}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Nowy profil</Text>
      <Text style={styles.subtitle}>Możesz edytować tekst przed zapisaniem</Text>

      <Text style={styles.label}>O MNIE</Text>
      <TextInput
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.buttonContainer}>
        <Button
          title="Zapisz"
          variant="accent"
          onPress={handleApply}
          disabled={isSubmitting || bio.trim().length < 10 || lookingFor.trim().length < 10}
          loading={isSubmitting}
        />
      </View>
    </ScrollView>
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
  scrollContent: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.section,
    paddingBottom: spacing.block,
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
    marginTop: spacing.column,
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: spacing.section,
  },
});
