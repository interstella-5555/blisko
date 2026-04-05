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

type OfferType = "help" | "exchange" | "gig" | "collaboration";

const OFFER_OPTIONS: { value: OfferType; emoji: string; label: string }[] = [
  { value: "help", emoji: "🤝", label: "Pomoc i wsparcie" },
  { value: "exchange", emoji: "🔄", label: "Wymiana skilli" },
  { value: "gig", emoji: "💼", label: "Zlecenie" },
  { value: "collaboration", emoji: "🧑‍💻", label: "Współpraca" },
];

export default function SuperpowerScreen() {
  const { superpower, offerTypes, displayName, setSuperpower, toggleOfferType, complete } = useOnboardingStore();
  const setProfile = useAuthStore((s) => s.setProfile);
  const setHasCheckedProfile = useAuthStore((s) => s.setHasCheckedProfile);
  const [text, setText] = useState(superpower);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const createGhost = trpc.profiling.createGhostProfile.useMutation();

  const canProceed = text.trim().length > 0;

  const handleNext = () => {
    setSuperpower(text.trim());
    router.push("/onboarding/status" as never);
  };

  const handleSkipConfirm = async () => {
    setShowSkipModal(false);
    try {
      const profile = await createGhost.mutateAsync({
        displayName,
        visibilityMode: "ninja",
        superpower: text.trim() || undefined,
        offerType: offerTypes.length > 0 ? offerTypes : undefined,
      });
      useOnboardingStore.getState().setVisibilityMode("ninja");
      setProfile(profile);
      setHasCheckedProfile(true);
      complete();
      setTimeout(() => router.replace("/(tabs)"), 100);
    } catch (err) {
      console.error("Failed to create ghost profile:", err);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: "33%" }]} />
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <IconChevronLeft size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.counter}>Krok 1 z 3</Text>
        </View>

        <Text style={styles.title}>W czym możesz komuś pomóc od ręki?</Text>
        <Text style={styles.subtitle}>W zamian za kawę lub dobrą rozmowę</Text>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="np. Mogę pomóc z designem UX, dam feedback na pitch deck"
          placeholderTextColor={colors.muted}
          spellCheck={false}
          autoCorrect={false}
          multiline
          maxLength={300}
          autoFocus
        />
        <Text style={styles.charCount}>{text.length} / 300</Text>

        <Text style={styles.sectionLabel}>FORMA POMOCY</Text>
        <View style={styles.offerRow}>
          {OFFER_OPTIONS.map((opt) => {
            const selected = offerTypes.includes(opt.value);
            return (
              <Pressable
                key={opt.value}
                style={[styles.offerTile, selected && styles.offerTileSelected]}
                onPress={() => toggleOfferType(opt.value)}
              >
                <Text style={styles.offerEmoji}>{opt.emoji}</Text>
                <Text style={[styles.offerLabel, selected && styles.offerLabelSelected]}>{opt.label}</Text>
              </Pressable>
            );
          })}
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
  offerRow: {
    flexDirection: "row",
    gap: spacing.tight,
  },
  offerTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.gutter,
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 12,
  },
  offerTileSelected: {
    borderColor: "#D4851C",
    backgroundColor: "#FFF8F0",
  },
  offerEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  offerLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 9,
    color: colors.muted,
    textAlign: "center",
  },
  offerLabelSelected: {
    color: "#D4851C",
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
