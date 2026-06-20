import { Trans, useLingui } from "@lingui/react/macro";
import { ONBOARDING_QUESTIONS } from "@repo/shared";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { DotsProgress } from "@/components/onboarding/DotsProgress";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { showModerationToastIfApplicable, uploadImage } from "@/lib/uploadImage";
import { useAuthStore } from "@/stores/authStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { colors, fonts, spacing, type as typ } from "@/theme";
import { signOutAndReset } from "../_layout";

// The single conversational question that drives the AI portrait in the v4
// trimmed flow. Sourced from the shared question bank so server validation
// (submitOnboarding) and the prompt examples stay in lock-step.
const INTRO_QUESTION = ONBOARDING_QUESTIONS.find((q) => q.id === "intro");

export default function OnboardingStartScreen() {
  const user = useAuthStore((state) => state.user);
  const { displayName, setDisplayName, setAnswer, avatarUrl, setAvatarUrl } = useOnboardingStore();
  const { t } = useLingui();

  const [name, setName] = useState(displayName || user?.name || "");
  const [intro, setIntro] = useState(() => useOnboardingStore.getState().answers.intro ?? "");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canProceed = name.trim().length >= 2 && intro.trim().length > 0 && !!avatarUrl && ageConfirmed && !uploading;

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const { source } = await uploadImage(result.assets[0]);
      setAvatarUrl(source);
    } catch (error) {
      if (showModerationToastIfApplicable(error)) return;
      Alert.alert(t`Błąd`, t`Nie udało się przesłać zdjęcia`);
    } finally {
      setUploading(false);
    }
  };

  const handleNext = () => {
    if (!canProceed) return;
    setDisplayName(name.trim());
    setAnswer("intro", intro.trim());
    router.push("/onboarding/categories");
  };

  return (
    <KeyboardAvoidingView style={styles.keyboardWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Stack.Screen options={{ header: () => <OnboardingStepHeader label="" onLogout={signOutAndReset} /> }} />
      <OnboardingScreen
        footer={
          <Button
            testID="onboarding-step1-next"
            title={t`Dalej`}
            variant="accent"
            onPress={handleNext}
            disabled={!canProceed}
            loading={uploading}
          />
        }
      >
        <DotsProgress count={3} active={0} />

        <Input
          testID="name-input"
          value={name}
          onChangeText={setName}
          placeholder={t`Twoje imię`}
          label={t`Cześć! Jak masz na imię?`}
          autoCapitalize="words"
          maxLength={30}
        />

        <Text style={styles.question}>{INTRO_QUESTION?.question}</Text>
        <TextInput
          testID="intro-input"
          style={styles.introInput}
          value={intro}
          onChangeText={setIntro}
          placeholder={t`Jednym tchem…`}
          placeholderTextColor={colors.muted}
          spellCheck={false}
          autoCorrect={false}
          multiline
          maxLength={500}
        />

        <Pressable
          testID="onboarding-photo-button"
          onPress={handlePickPhoto}
          disabled={uploading}
          style={[styles.photoRow, avatarUrl ? styles.photoRowFilled : styles.photoRowEmpty]}
        >
          {avatarUrl ? (
            <Avatar uri={avatarUrl} name={name || "?"} size={56} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderIcon}>📷</Text>
            </View>
          )}
          <View style={styles.photoTextBlock}>
            <Text style={styles.photoTitle}>
              {avatarUrl ? <Trans>Zmień zdjęcie</Trans> : <Trans>Dodaj zdjęcie</Trans>}
            </Text>
            <Text style={styles.photoHint}>
              <Trans>Bez zdjęcia nie zapingujesz</Trans>
            </Text>
          </View>
        </Pressable>

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
  question: {
    ...typ.heading,
    marginTop: spacing.block,
    marginBottom: spacing.column,
  },
  introInput: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingVertical: 12,
    paddingHorizontal: 0,
    minHeight: 64,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.column,
    marginTop: spacing.section,
    padding: spacing.gutter,
    borderRadius: 14,
    borderWidth: 1,
  },
  photoRowEmpty: {
    borderColor: colors.accent,
    borderStyle: "dashed",
    backgroundColor: "rgba(192,57,43,0.04)",
  },
  photoRowFilled: {
    borderColor: colors.rule,
    backgroundColor: "transparent",
  },
  photoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(192,57,43,0.08)",
  },
  photoPlaceholderIcon: {
    fontSize: 22,
  },
  photoTextBlock: {
    flex: 1,
    gap: 2,
  },
  photoTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.accent,
  },
  photoHint: {
    ...typ.caption,
    color: colors.muted,
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
