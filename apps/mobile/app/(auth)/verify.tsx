import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../src/components/ui/Button";
import { IconSend } from "../../src/components/ui/icons";
import { authClient } from "../../src/lib/auth";
import { useAuthStore } from "../../src/stores/authStore";
import { colors, fonts, spacing, type as typ } from "../../src/theme";

const authErrorMessages: Record<string, string> = {
  "Too many requests. Please try again later.": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
};

function translateAuthError(message?: string): string {
  if (!message) return "Wystąpił błąd";
  if (authErrorMessages[message]) return authErrorMessages[message];
  try {
    const parsed = JSON.parse(message);
    if (parsed.error === "RATE_LIMITED" && parsed.message) return parsed.message;
  } catch {
    // Not JSON, use as-is
  }
  return message;
}

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 10; // seconds between resends (10s for testing)

export default function VerifyScreen() {
  const { email, otp: initialOtp } = useLocalSearchParams<{ email: string; otp?: string }>();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { setUser, setSession, setHasCheckedProfile, setProfile } = useAuthStore();
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleVerify = useCallback(
    async (verifyCode?: string) => {
      const codeToVerify = verifyCode || code.join("");

      if (codeToVerify.length !== CODE_LENGTH) {
        setError("Wpisz 6-cyfrowy kod");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await authClient.signIn.emailOtp({
          email: email!,
          otp: codeToVerify,
        });

        if (result.error) {
          setError(translateAuthError(result.error.message) || "Nieprawidłowy kod");
          setIsLoading(false);
          return;
        }

        if (result.data?.user && result.data?.token) {
          const { user, token } = result.data;
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

          await SecureStore.setItemAsync("blisko_session_token", token);
          await SecureStore.setItemAsync(
            "blisko_session_data",
            JSON.stringify({ token, user, expiresAt: expiresAt.toISOString() }),
          );

          // Reset profile state so query runs fresh
          setProfile(null);
          setHasCheckedProfile(false);

          setUser(user);
          setSession({
            id: token, // Use token as session id
            userId: user.id,
            token,
            expiresAt,
          });

          router.replace("/(tabs)");
        } else {
          setError("Nieprawidłowa odpowiedź serwera");
        }
      } catch (err) {
        console.error("Verify error:", err);
        setError("Nie udało się zweryfikować kodu");
      }

      setIsLoading(false);
    },
    [code, email, setProfile, setHasCheckedProfile, setUser, setSession],
  );

  // Auto-verify if OTP came from deep link
  useEffect(() => {
    if (initialOtp && initialOtp.length === CODE_LENGTH) {
      const digits = initialOtp.split("");
      setCode(digits);
      handleVerify(initialOtp);
    }
  }, [initialOtp, handleVerify]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleCodeChange = (value: string, index: number) => {
    // Handle paste of full code
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH).split("");
      const newCode = [...code];
      digits.forEach((digit, i) => {
        if (index + i < CODE_LENGTH) {
          newCode[index + i] = digit;
        }
      });
      setCode(newCode);

      // Focus last filled or next empty
      const nextIndex = Math.min(index + digits.length, CODE_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();

      // Auto-submit if complete
      if (newCode.every((d) => d !== "")) {
        handleVerify(newCode.join(""));
      }
      return;
    }

    // Single digit
    const digit = value.replace(/\D/g, "");
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    // Move to next input
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if complete
    if (newCode.every((d) => d !== "")) {
      handleVerify(newCode.join(""));
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email!,
        type: "sign-in",
      });

      if (result.error) {
        setError(translateAuthError(result.error.message) || "Nie udało się wysłać kodu");
      } else {
        setResendCooldown(RESEND_COOLDOWN);
        // Clear the code inputs
        setCode(Array(CODE_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      }
    } catch (_err) {
      setError("Nie udało się wysłać kodu");
    }

    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <IconSend size={32} color={colors.ink} />
        </View>
        <Text style={styles.title}>Wpisz kod</Text>
        <Text style={styles.message}>Wysłaliśmy 6-cyfrowy kod na adres:</Text>
        <Text style={styles.email}>{email}</Text>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length OTP inputs
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[styles.codeInput, digit && styles.codeInputFilled, error && styles.codeInputError]}
              value={digit}
              onChangeText={(value) => handleCodeChange(value, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={index === 0 ? CODE_LENGTH : 1}
              selectTextOnFocus
              editable={!isLoading}
              testID={`code-input-${index}`}
            />
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {isLoading && <Text style={styles.loading}>Weryfikacja...</Text>}

        <Text style={styles.hint}>Sprawdź folder spam jeśli nie widzisz maila</Text>

        <Button
          title={resendCooldown > 0 ? `Wyślij kod ponownie (${resendCooldown}s)` : "Wyślij kod ponownie"}
          variant="ghost"
          onPress={handleResend}
          disabled={resendCooldown > 0 || isLoading}
        />

        <Button title="Wróć" variant="ghost" onPress={() => router.back()} />
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
    alignItems: "center",
    paddingHorizontal: spacing.section,
  },
  iconContainer: {
    marginBottom: spacing.section,
  },
  title: {
    ...typ.display,
    marginBottom: spacing.column,
  },
  message: {
    ...typ.body,
    color: colors.muted,
    textAlign: "center",
  },
  email: {
    ...typ.body,
    fontFamily: fonts.sansMedium,
    color: colors.accent,
    marginTop: spacing.tight,
    marginBottom: spacing.block,
  },
  codeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: spacing.section,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: colors.ink,
    fontFamily: fonts.serif,
    fontSize: 20,
    textAlign: "center",
    backgroundColor: "transparent",
    color: colors.ink,
  },
  codeInputFilled: {
    borderColor: colors.accent,
  },
  codeInputError: {
    borderColor: colors.status.error.text,
  },
  error: {
    fontFamily: fonts.sans,
    color: colors.status.error.text,
    fontSize: 14,
    marginBottom: spacing.column,
    textAlign: "center",
  },
  loading: {
    ...typ.body,
    color: colors.accent,
    marginBottom: spacing.column,
  },
  hint: {
    ...typ.caption,
    textAlign: "center",
    marginTop: spacing.section,
    marginBottom: spacing.column,
  },
});
