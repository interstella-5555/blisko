import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { IconX } from "../../src/components/ui/icons";
import { useAuthStore } from "../../src/stores/authStore";
import { useOnboardingStore } from "../../src/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "../../src/theme";
import { signOutAndReset } from "../_layout";

export default function OnboardingNameScreen() {
  const user = useAuthStore((state) => state.user);
  const { displayName, setDisplayName } = useOnboardingStore();
  const [name, setName] = useState(displayName || user?.name || "");
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  const handleLogout = () => signOutAndReset();

  const canProceed = name.trim().length >= 2 && ageConfirmed;

  const handleNext = () => {
    if (!canProceed) return;
    setDisplayName(name.trim());
    router.push("/onboarding/visibility");
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.content}>
        <View style={styles.stepRow}>
          <Text style={styles.step}>Krok 1</Text>
          <Pressable onPress={handleLogout} hitSlop={12} style={styles.logoutButton}>
            <IconX size={12} color={colors.muted} />
            <Text style={styles.logoutText}>Wyloguj</Text>
          </Pressable>
        </View>
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
          <Switch
            testID="age-confirm-toggle"
            value={ageConfirmed}
            onValueChange={setAgeConfirmed}
            trackColor={{ false: colors.rule, true: "#D4851C" }}
            thumbColor="#FFFFFF"
          />
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
    paddingTop: 100,
  },
  stepRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.tight,
  },
  step: {
    ...typ.caption,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  logoutText: {
    ...typ.caption,
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
