import type { StatusCategory } from "@repo/shared";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { NinjaSkipModal } from "@/components/NinjaSkipModal";
import { Button } from "@/components/ui/Button";
import { IconChevronLeft } from "@/components/ui/icons";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

type Visibility = "public" | "private";

const CATEGORY_OPTIONS: { value: StatusCategory; label: string; emoji: string }[] = [
  { value: "project", label: "Projekt / Współpraca", emoji: "⚡" },
  { value: "networking", label: "Networking / Sparring", emoji: "🤝" },
  { value: "dating", label: "Randka / Relacja", emoji: "🔥" },
  { value: "casual", label: "Luźne wyjście / Hobby", emoji: "☕" },
];

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "👁 Publiczny" },
  { value: "private", label: "🔒 Prywatny" },
];

export default function StatusScreen() {
  const store = useOnboardingStore();
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHasCheckedProfile = useAuthStore((s) => s.setHasCheckedProfile);
  const [text, setText] = useState(store.statusText);
  const [categories, setCategories] = useState<StatusCategory[]>(store.statusCategories);
  const [visibility, setVisibility] = useState<Visibility>(store.statusVisibility);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const createGhost = trpc.profiling.createGhostProfile.useMutation();

  const toggleCategory = (cat: StatusCategory) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : prev.length < 2 ? [...prev, cat] : prev,
    );
  };

  const canProceed = text.trim().length >= 10 && categories.length > 0;

  const handleNext = () => {
    store.setStatusText(text.trim());
    store.setStatusCategories(categories);
    store.setStatusVisibility(visibility);
    router.push("/onboarding/questions");
  };

  const handleSkipConfirm = async () => {
    setShowSkipModal(false);
    try {
      const { displayName, superpower, offerTypes } = useOnboardingStore.getState();
      const profile = await createGhost.mutateAsync({
        displayName,
        visibilityMode: "ninja",
        superpower: superpower || undefined,
        offerType: offerTypes.length > 0 ? offerTypes : undefined,
      });
      store.setVisibilityMode("ninja");
      setProfile(profile);
      setHasCheckedProfile(true);
      store.complete();
      setTimeout(() => router.replace("/(tabs)"), 100);
    } catch (err) {
      console.error("Failed to create ghost profile:", err);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: "66%" }]} />
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <IconChevronLeft size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.counter}>Krok 2 z 3</Text>
        </View>

        <Text style={styles.title}>Czego aktualnie szukasz?</Text>
        <Text style={styles.subtitle}>Możesz to zmienić w każdej chwili na mapie</Text>

        <View style={styles.categoryGrid}>
          {CATEGORY_OPTIONS.map((cat) => {
            const selected = categories.includes(cat.value);
            return (
              <Pressable
                key={cat.value}
                style={[styles.categoryTile, selected && styles.categoryTileSelected]}
                onPress={() => toggleCategory(cat.value)}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Opisz czego szukasz (min. 10 znaków)"
          placeholderTextColor={colors.muted}
          spellCheck={false}
          autoCorrect={false}
          multiline
          maxLength={150}
        />
        <Text style={styles.charCount}>{text.length} / 150</Text>

        <Text style={styles.sectionLabel}>WIDOCZNOŚĆ STATUSU</Text>
        <View style={styles.visRow}>
          {VISIBILITY_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.visChip, visibility === opt.value && styles.visChipSelected]}
              onPress={() => setVisibility(opt.value)}
            >
              <Text style={[styles.visChipText, visibility === opt.value && styles.visChipTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1 }} />
        <Button title="Dalej" variant="accent" onPress={handleNext} disabled={!canProceed} />
        <Pressable onPress={() => setShowSkipModal(true)} hitSlop={8} style={styles.skipButton}>
          <Text style={styles.skipText}>Pomiń</Text>
        </Pressable>
      </View>

      <NinjaSkipModal visible={showSkipModal} onConfirm={handleSkipConfirm} onCancel={() => setShowSkipModal(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  progressBarBg: {
    height: 3,
    backgroundColor: colors.rule,
    width: "100%",
  },
  progressBarFill: {
    height: 3,
    backgroundColor: colors.accent,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.section,
    paddingTop: spacing.block,
    paddingBottom: spacing.section,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.block,
  },
  counter: {
    ...typ.caption,
  },
  title: {
    ...typ.heading,
    marginBottom: spacing.tight,
  },
  subtitle: {
    ...typ.body,
    color: colors.muted,
    marginBottom: spacing.section,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.tight,
    marginBottom: spacing.section,
  },
  categoryTile: {
    width: "48%",
    alignItems: "center",
    paddingVertical: spacing.column,
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 12,
  },
  categoryTileSelected: {
    borderColor: "#D4851C",
    backgroundColor: "#FFF8F0",
  },
  categoryEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.muted,
    textAlign: "center",
  },
  categoryLabelSelected: {
    color: "#D4851C",
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 12,
    padding: spacing.gutter,
    minHeight: 70,
    textAlignVertical: "top",
  },
  charCount: {
    ...typ.caption,
    textAlign: "right",
    marginTop: spacing.hairline,
    marginBottom: spacing.section,
  },
  sectionLabel: {
    ...typ.label,
    marginBottom: spacing.gutter,
  },
  visRow: {
    flexDirection: "row",
    gap: spacing.tight,
    marginBottom: spacing.section,
  },
  visChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.rule,
    alignItems: "center",
  },
  visChipSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(192, 57, 43, 0.04)",
  },
  visChipText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    color: colors.muted,
  },
  visChipTextSelected: {
    color: colors.accent,
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: spacing.tight,
    marginTop: spacing.tight,
  },
  skipText: {
    ...typ.caption,
    color: colors.muted,
  },
});
