import { router, Stack } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "@/theme";
import { signOutAndReset } from "../_layout";

export default function OnboardingNameScreen() {
  const user = useAuthStore((state) => state.user);
  const { displayName, setDisplayName } = useOnboardingStore();
  const [name, setName] = useState(displayName || user?.name || "");
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const canProceed = name.trim().length >= 2 && ageConfirmed;

  const handleNext = () => {
    if (!canProceed) return;
    setDisplayName(name.trim());
    router.push("/onboarding/visibility");
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Stack.Screen options={{ header: () => <OnboardingStepHeader label="Krok 1" onLogout={signOutAndReset} /> }} />
      <View style={styles.content}>
        <Text style={styles.title}>Jak masz na imie?</Text>
        <Text style={styles.subtitle}>To imie bedzie widoczne dla innych uzytkownikow</Text>

        <Input
          testID="name-input"
          value={name}
          onChangeText={setName}
          placeholder="Twoje imie"
          autoCapitalize="words"
          autoFocus
          maxLength={30}
        />

        <View style={styles.ageRow}>
          <Toggle testID="age-confirm-toggle" value={ageConfirmed} onValueChange={setAgeConfirmed} />
          <Text style={styles.ageLabel}>Potwierdzam, że mam ukończone 18 lat</Text>
        </View>

        <View style={{ marginTop: spacing.section }}>
          <Button title="Dalej" variant="accent" onPress={handleNext} disabled={!canProceed} />
        </View>
      </View>
    </KeyboardAvoidingView>
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
    paddingTop: spacing.tight,
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
  ageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    marginTop: spacing.section,
  },
  ageLabel: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
  },
});
