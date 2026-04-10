import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/ui/Button";
import { trpc } from "../../src/lib/trpc";
import { useAuthStore } from "../../src/stores/authStore";
import { useOnboardingStore } from "../../src/stores/onboardingStore";
import { colors, spacing, type as typ } from "../../src/theme";

export default function VisibilityScreen() {
  const { displayName, complete } = useOnboardingStore();
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHasCheckedProfile = useAuthStore((s) => s.setHasCheckedProfile);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const createGhost = trpc.profiling.createGhostProfile.useMutation();
  const profileQuery = trpc.profiles.me.useQuery(undefined, { enabled: false });

  const handleGhost = async () => {
    setIsCreating(true);
    setError("");
    try {
      const profile = await createGhost.mutateAsync({ displayName });
      setProfile(profile);
      setHasCheckedProfile(true);
      complete();
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 100);
    } catch (err: unknown) {
      const trpcErr = err as { data?: { code?: string } };
      if (trpcErr?.data?.code === "CONFLICT") {
        // Profile already exists (e.g., app crashed after creation) — recover
        const { data: existing } = await profileQuery.refetch();
        if (existing) {
          setProfile(existing);
          setHasCheckedProfile(true);
          complete();
          router.replace("/(tabs)");
          return;
        }
      }
      console.error("Failed to create ghost profile:", err);
      setError("Nie udało się utworzyć profilu. Spróbuj ponownie.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleFillProfile = () => {
    router.push("/onboarding/questions");
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Chcesz być widoczny?</Text>

        <View style={styles.options}>
          <View style={styles.option}>
            <Button testID="fill-profile-button" title="Wypełnij profil" variant="accent" onPress={handleFillProfile} />
            <Text style={styles.optionDesc}>Inni zobaczą Twój profil i będą mogli Cię znaleźć</Text>
          </View>

          <View style={styles.option}>
            <Button
              testID="ghost-profile-button"
              title="Na razie tylko imię"
              variant="ghost"
              onPress={handleGhost}
              loading={isCreating}
            />
            <Text style={styles.optionDesc}>
              Nie będziesz widoczny. Możesz dołączać do grup tylko przez zaproszenie.
            </Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.section,
    paddingTop: 100,
  },
  title: {
    ...typ.display,
    marginBottom: spacing.block,
  },
  options: {
    gap: spacing.section,
  },
  option: {
    gap: spacing.tight,
  },
  optionDesc: {
    ...typ.body,
    color: colors.muted,
    paddingHorizontal: spacing.hairline,
  },
  error: {
    ...typ.body,
    color: colors.status.error.text,
    textAlign: "center",
    marginTop: spacing.column,
  },
});
