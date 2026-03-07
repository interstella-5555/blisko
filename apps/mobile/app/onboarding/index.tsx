import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { IconX } from "../../src/components/ui/icons";
import { authClient } from "../../src/lib/auth";
import { trpcClient } from "../../src/lib/trpc";
import { useAuthStore } from "../../src/stores/authStore";
import { useConversationsStore } from "../../src/stores/conversationsStore";
import { useMessagesStore } from "../../src/stores/messagesStore";
import { useOnboardingStore } from "../../src/stores/onboardingStore";
import { useProfilesStore } from "../../src/stores/profilesStore";
import { useWavesStore } from "../../src/stores/wavesStore";
import { colors, spacing, type as typ } from "../../src/theme";
import { queryClient } from "../_layout";

export default function OnboardingNameScreen() {
  const user = useAuthStore((state) => state.user);
  const { displayName, setDisplayName } = useOnboardingStore();
  const [name, setName] = useState(displayName || user?.name || "");

  const handleLogout = async () => {
    try {
      const pushToken = await SecureStore.getItemAsync("lastRegisteredPushToken");
      if (pushToken) {
        await trpcClient.pushTokens.unregister.mutate({ token: pushToken });
        await SecureStore.deleteItemAsync("lastRegisteredPushToken");
      }
    } catch {}

    await authClient.signOut();
    await SecureStore.deleteItemAsync("blisko_session_token");
    queryClient.clear();
    useAuthStore.getState().reset();
    useProfilesStore.getState().reset();
    useConversationsStore.getState().reset();
    useMessagesStore.getState().reset();
    useWavesStore.getState().reset();
    router.replace("/(auth)/login");
  };

  const handleNext = () => {
    if (name.trim().length < 2) return;
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

        <View style={{ marginTop: spacing.section }}>
          <Button title="Dalej" variant="accent" onPress={handleNext} disabled={name.trim().length < 2} />
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
});
