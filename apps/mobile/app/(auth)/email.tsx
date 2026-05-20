import { Trans, useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { authClient } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

function useTranslateAuthError() {
  const { t } = useLingui();
  return (message?: string): string => {
    if (!message) return t`Wystąpił błąd`;
    if (message === "Too many requests. Please try again later.") {
      return t`Za dużo prób logowania. Spróbuj ponownie za kilka minut.`;
    }
    if (message === "ACCOUNT_SUSPENDED") {
      return t`Konto zawieszone. Skontaktuj się z administracją: kontakt@blisko.app, jeśli uważasz, że to pomyłka.`;
    }
    if (message === "ACCOUNT_DELETED") {
      return t`Twoje konto jest w trakcie usuwania. Może to potrwać do 14 dni.`;
    }
    // Try parsing rate limit JSON response from Hono middleware
    try {
      const parsed = JSON.parse(message);
      if (parsed.error === "RATE_LIMITED" && parsed.message) return parsed.message;
    } catch {
      // Not JSON, use as-is
    }
    return message;
  };
}

export default function EmailLoginScreen() {
  const { t } = useLingui();
  const translateAuthError = useTranslateAuthError();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setSession, setProfile, setHasCheckedProfile } = useAuthStore();

  const handleSendMagicLink = async (emailOverride?: string) => {
    const target = (emailOverride || email).trim();
    if (!target) {
      setError(t`Podaj adres email`);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Dev auto-login for @example.com emails
    if (target.endsWith("@example.com")) {
      try {
        const response = await fetch(`${API_URL}/dev/auto-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: target }),
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || "Auto-login failed");
          setIsLoading(false);
          return;
        }

        const data = await response.json();

        await SecureStore.setItemAsync("blisko_session_token", data.session.token);
        await SecureStore.setItemAsync(
          "blisko_session_data",
          JSON.stringify({
            session: data.session,
            user: data.user,
          }),
        );

        setProfile(null);
        setHasCheckedProfile(false);

        setUser(data.user);
        setSession({
          ...data.session,
          expiresAt: new Date(data.session.expiresAt),
        });

        router.replace("/(tabs)");
        return;
      } catch (_err) {
        setError(t`Dev auto-login failed`);
        setIsLoading(false);
        return;
      }
    }

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: target,
        type: "sign-in",
      });

      if (result.error) {
        setError(translateAuthError(result.error.message));
        setIsLoading(false);
        return;
      }

      router.push({
        pathname: "/(auth)/verify",
        params: { email: target },
      });
    } catch (_err) {
      setError(t`Nie udało się wysłać kodu`);
    }

    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.content}>
        <Text style={styles.title}>
          <Trans>Zaloguj się emailem</Trans>
        </Text>
        <Text style={styles.subtitle}>
          <Trans>Wyślemy Ci jednorazowy kod weryfikacyjny</Trans>
        </Text>

        <View style={styles.form}>
          <Input
            testID="email-input"
            placeholder="twoj@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!isLoading}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            testID="send-link-button"
            title={isLoading ? t`Wysyłanie...` : t`Wyślij kod`}
            variant="accent"
            onPress={() => handleSendMagicLink()}
            disabled={isLoading}
            loading={isLoading}
          />

          <Pressable onPress={() => router.back()} style={styles.backLink} hitSlop={8}>
            <Text style={styles.backLinkText}>
              <Trans>Spróbuj innej metody logowania</Trans>
            </Text>
          </Pressable>
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
    justifyContent: "center",
    paddingHorizontal: spacing.section,
  },
  title: {
    ...typ.display,
    fontSize: 22,
    textAlign: "center",
    marginBottom: spacing.tight,
  },
  subtitle: {
    ...typ.body,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.block,
  },
  form: {
    gap: spacing.column,
  },
  error: {
    fontFamily: fonts.sans,
    color: colors.status.error.text,
    fontSize: 14,
  },
  backLink: {
    alignSelf: "center",
    marginTop: spacing.column,
  },
  backLinkText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: "underline",
  },
});
