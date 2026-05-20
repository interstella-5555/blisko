import { Trans, useLingui } from "@lingui/react/macro";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
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
  const { t } = useLingui();

  const canProceed = name.trim().length >= 2 && ageConfirmed;

  const handleNext = () => {
    if (!canProceed) return;
    setDisplayName(name.trim());
    router.push("/onboarding/visibility");
  };

  return (
    <KeyboardAvoidingView style={styles.keyboardWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Stack.Screen options={{ header: () => <OnboardingStepHeader label={t`Krok 1`} onLogout={signOutAndReset} /> }} />
      <OnboardingScreen
        footer={<Button title={t`Dalej`} variant="accent" onPress={handleNext} disabled={!canProceed} />}
      >
        <Text style={styles.title}>
          <Trans>Jak masz na imię?</Trans>
        </Text>
        <Text style={styles.subtitle}>
          <Trans>Twoje imię będzie widoczne publicznie</Trans>
        </Text>

        <Input
          testID="name-input"
          value={name}
          onChangeText={setName}
          placeholder={t`Twoje imię`}
          autoCapitalize="words"
          autoFocus
          maxLength={30}
        />

        <View style={styles.ageRow}>
          <Toggle testID="age-confirm-toggle" value={ageConfirmed} onValueChange={setAgeConfirmed} />
          <Text style={styles.ageLabel}>
            <Trans>Potwierdzam, że mam ukończone 18 lat</Trans>
          </Text>
        </View>
      </OnboardingScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardWrap: {
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
