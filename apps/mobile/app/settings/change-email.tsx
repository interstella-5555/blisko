import { router } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { authClient } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

export default function ChangeEmailScreen() {
  const user = useAuthStore((state) => state.user);
  const [newEmail, setNewEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setError("Podaj nowy adres email");
      return;
    }
    if (email === user?.email) {
      setError("Nowy email musi być inny niż obecny");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.emailOtp.requestEmailChange({
        newEmail: email,
      });

      if (result.error) {
        setError(result.error.message || "Nie udało się wysłać kodu");
        setIsLoading(false);
        return;
      }

      router.push({
        pathname: "/settings/verify-email" as never,
        params: { newEmail: email },
      });
    } catch (_err) {
      setError("Nie udało się wysłać kodu");
    }

    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.content}>
        <Text style={styles.subtitle}>Obecny email: {user?.email}</Text>

        <View style={styles.form}>
          <Input
            placeholder="nowy@email.com"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            editable={!isLoading}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            title={isLoading ? "Wysyłanie..." : "Wyślij kod weryfikacyjny"}
            variant="accent"
            onPress={handleSendCode}
            disabled={isLoading}
            loading={isLoading}
          />
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
    paddingTop: spacing.block,
  },
  subtitle: {
    ...typ.body,
    color: colors.muted,
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
});
