import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Trans, useLingui } from "@lingui/react/macro";
import type { StatusCategory } from "@repo/shared";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { DotsProgress } from "@/components/onboarding/DotsProgress";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import { Button } from "@/components/ui/Button";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

export default function OnboardingCategoriesScreen() {
  const { t } = useLingui();
  const { statusCategories, setStatusCategories, statusText, setStatusText } = useOnboardingStore();

  const CATEGORY_OPTIONS: {
    value: StatusCategory;
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }[] = [
    { value: "project", label: t`Projekt`, icon: "lightbulb-outline" },
    { value: "networking", label: t`Networking`, icon: "account-multiple-outline" },
    { value: "dating", label: t`Randka`, icon: "heart-outline" },
    { value: "casual", label: t`Luźne wyjście`, icon: "coffee-outline" },
  ];

  const [selected, setSelected] = useState<StatusCategory[]>(statusCategories);
  const [text, setText] = useState(statusText);

  const toggle = (cat: StatusCategory) => {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : prev.length < 2 ? [...prev, cat] : prev,
    );
  };

  const canProceed = selected.length > 0;

  const handleNext = () => {
    if (!canProceed) return;
    setStatusCategories(selected);
    setStatusText(text.trim());
    router.push("/onboarding/account-visibility");
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Stack.Screen options={{ header: () => <OnboardingStepHeader label="" onBack={() => router.back()} /> }} />
      <OnboardingScreen
        footer={
          <Button
            testID="onboarding-categories-next"
            title={t`Dalej`}
            variant="accent"
            onPress={handleNext}
            disabled={!canProceed}
          />
        }
      >
        <DotsProgress count={3} active={1} />

        <Text style={styles.title}>
          <Trans>Czego szukasz dziś?</Trans>
        </Text>
        <Text style={styles.subtitle}>
          <Trans>Wybierz maksymalnie 2 — to widzą inni obok Ciebie.</Trans>
        </Text>

        <View style={styles.tiles}>
          {CATEGORY_OPTIONS.map((cat) => {
            const isSel = selected.includes(cat.value);
            return (
              <Pressable
                key={cat.value}
                testID={`onboarding-category-${cat.value}`}
                style={[styles.tile, isSel && styles.tileSelected]}
                onPress={() => toggle(cat.value)}
              >
                <MaterialCommunityIcons name={cat.icon} size={26} color={isSel ? colors.accent : colors.muted} />
                <Text style={[styles.tileLabel, isSel && styles.tileLabelSelected]}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>
          <Trans>Dodaj słowo lub dwa (opcjonalnie)</Trans>
        </Text>
        <TextInput
          testID="onboarding-status-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t`np. szukam ludzi na jam session`}
          placeholderTextColor={colors.muted}
          spellCheck={false}
          autoCorrect={false}
          multiline
          maxLength={150}
        />
      </OnboardingScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.gutter,
    marginBottom: spacing.section,
  },
  tile: {
    width: "47%",
    flexGrow: 1,
    alignItems: "center",
    gap: spacing.tick,
    paddingVertical: spacing.column,
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 14,
  },
  tileSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(192,57,43,0.06)",
  },
  tileLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.muted,
  },
  tileLabelSelected: {
    color: colors.accent,
  },
  fieldLabel: {
    ...typ.label,
    marginBottom: spacing.tight,
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
});
