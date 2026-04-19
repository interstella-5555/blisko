import { OTP_LENGTH, RESEND_COOLDOWN_SECONDS } from "@repo/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Button } from "@/components/ui/Button";
import { IconSend } from "@/components/ui/icons";
import { authClient } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

export default function VerifyEmailScreen() {
  const { newEmail } = useLocalSearchParams<{ newEmail: string }>();
  const [code, setCode] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleCodeChange = (value: string, index: number) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
      const newCode = [...code];
      digits.forEach((digit, i) => {
        if (index + i < OTP_LENGTH) {
          newCode[index + i] = digit;
        }
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
      if (newCode.every((d) => d !== "")) {
        handleVerify(newCode.join(""));
      }
      return;
    }

    const digit = value.replace(/\D/g, "");
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every((d) => d !== "")) {
      handleVerify(newCode.join(""));
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (verifyCode?: string) => {
    const codeToVerify = verifyCode || code.join("");
    if (codeToVerify.length !== OTP_LENGTH) {
      setError("Wpisz 6-cyfrowy kod");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.emailOtp.changeEmail({
        newEmail: newEmail!,
        otp: codeToVerify,
      });

      if (result.error) {
        setError(result.error.message || "Nieprawidłowy kod");
        setIsLoading(false);
        return;
      }

      if (user) {
        setUser({ ...user, email: newEmail! });
      }

      router.dismiss(2);
    } catch (_err) {
      setError("Nie udało się zweryfikować kodu");
    }

    setIsLoading(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.emailOtp.requestEmailChange({
        newEmail: newEmail!,
      });

      if (result.error) {
        setError(result.error.message || "Nie udało się wysłać kodu");
      } else {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        setCode(Array(OTP_LENGTH).fill(""));
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
        <Text style={styles.email}>{newEmail}</Text>

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
              maxLength={index === 0 ? OTP_LENGTH : 1}
              selectTextOnFocus
              editable={!isLoading}
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
