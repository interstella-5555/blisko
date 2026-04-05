import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

type VisibilityMode = "ninja" | "semi_open" | "full_nomad";

const MODES: { value: VisibilityMode; emoji: string; name: string; desc: string }[] = [
  {
    value: "ninja",
    emoji: "🥷",
    name: "Ninja",
    desc: "Widzisz innych, Ciebie nie widać. Nie możesz pingować.",
  },
  {
    value: "semi_open",
    emoji: "🔵",
    name: "Semi-Open",
    desc: "Widoczny na mapie. Możesz pingować i być pingowany.",
  },
  {
    value: "full_nomad",
    emoji: "🟢",
    name: "Full Nomad",
    desc: "Widoczny, otwarty. AI zachęca innych do kontaktu z Tobą.",
  },
];

export default function VisibilityScreen() {
  const { displayName, setVisibilityMode, complete } = useOnboardingStore();
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHasCheckedProfile = useAuthStore((s) => s.setHasCheckedProfile);
  const [selected, setSelected] = useState<VisibilityMode>("semi_open");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const createGhost = trpc.profiling.createGhostProfile.useMutation();

  const handleNext = async () => {
    setVisibilityMode(selected);

    if (selected === "ninja") {
      setIsCreating(true);
      setError("");
      try {
        const profile = await createGhost.mutateAsync({
          displayName,
          visibilityMode: "ninja",
        });
        setProfile(profile);
        setHasCheckedProfile(true);
        complete();
        setTimeout(() => router.replace("/(tabs)"), 100);
      } catch (err) {
        console.error("Failed to create ghost profile:", err);
        setError("Nie udało się utworzyć profilu. Spróbuj ponownie.");
        setIsCreating(false);
      }
    } else {
      router.push("/onboarding/superpower" as never);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Jak chcesz korzystać z Blisko?</Text>
        <Text style={styles.subtitle}>Możesz to zmienić w każdej chwili w ustawieniach</Text>

        <View style={styles.options}>
          {MODES.map((mode) => (
            <Pressable
              key={mode.value}
              style={[styles.option, selected === mode.value && styles.optionSelected]}
              onPress={() => setSelected(mode.value)}
            >
              <Text style={styles.emoji}>{mode.emoji}</Text>
              <View style={styles.optionText}>
                <Text style={styles.optionName}>{mode.name}</Text>
                <Text style={styles.optionDesc}>{mode.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ flex: 1 }} />
        <Button title="Dalej" variant="accent" onPress={handleNext} loading={isCreating} />
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
    paddingBottom: spacing.section,
  },
  title: {
    ...typ.display,
    marginBottom: spacing.tight,
  },
  subtitle: {
    ...typ.body,
    color: colors.muted,
    marginBottom: spacing.block,
  },
  options: {
    gap: spacing.gutter,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.gutter,
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 14,
    padding: spacing.column,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(192, 57, 43, 0.04)",
  },
  emoji: {
    fontSize: 22,
    marginTop: 2,
  },
  optionText: {
    flex: 1,
  },
  optionName: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 3,
  },
  optionDesc: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  error: {
    ...typ.body,
    color: colors.status.error.text,
    textAlign: "center",
    marginTop: spacing.column,
  },
});
