import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { authClient } from '../../src/lib/auth';
import { useAuthStore } from '../../src/stores/authStore';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 10; // seconds between resends (10s for testing)

export default function VerifyScreen() {
  const { email, otp: initialOtp } = useLocalSearchParams<{ email: string; otp?: string }>();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { setUser, setSession, setHasCheckedProfile, setProfile } = useAuthStore();
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Auto-verify if OTP came from deep link
  useEffect(() => {
    if (initialOtp && initialOtp.length === CODE_LENGTH) {
      const digits = initialOtp.split('');
      setCode(digits);
      handleVerify(initialOtp);
    }
  }, [initialOtp]);

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
      const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH).split('');
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
      if (newCode.every(d => d !== '')) {
        handleVerify(newCode.join(''));
      }
      return;
    }

    // Single digit
    const digit = value.replace(/\D/g, '');
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    // Move to next input
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if complete
    if (newCode.every(d => d !== '')) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (verifyCode?: string) => {
    const codeToVerify = verifyCode || code.join('');

    if (codeToVerify.length !== CODE_LENGTH) {
      setError('Wpisz 6-cyfrowy kod');
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
        setError(result.error.message || 'Nieprawidłowy kod');
        setIsLoading(false);
        return;
      }

      if (result.data?.user && result.data?.token) {
        const { user, token } = result.data;
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await SecureStore.setItemAsync('meet_session_token', token);
        await SecureStore.setItemAsync(
          'meet_session_data',
          JSON.stringify({ token, user, expiresAt: expiresAt.toISOString() })
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

        router.replace('/(tabs)');
      } else {
        setError('Nieprawidłowa odpowiedź serwera');
      }
    } catch (err) {
      console.error('Verify error:', err);
      setError('Nie udało się zweryfikować kodu');
    }

    setIsLoading(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email!,
        type: 'sign-in',
      });

      if (result.error) {
        setError(result.error.message || 'Nie udało się wysłać kodu');
      } else {
        setResendCooldown(RESEND_COOLDOWN);
        // Clear the code inputs
        setCode(Array(CODE_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError('Nie udało się wysłać kodu');
    }

    setIsLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>📧</Text>
        <Text style={styles.title}>Wpisz kod</Text>
        <Text style={styles.message}>
          Wysłaliśmy 6-cyfrowy kod na adres:
        </Text>
        <Text style={styles.email}>{email}</Text>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              style={[
                styles.codeInput,
                digit && styles.codeInputFilled,
                error && styles.codeInputError,
              ]}
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

        {isLoading && (
          <Text style={styles.loading}>Weryfikacja...</Text>
        )}

        <Text style={styles.hint}>
          Sprawdź folder spam jeśli nie widzisz maila
        </Text>

        <TouchableOpacity
          style={[styles.resendButton, resendCooldown > 0 && styles.resendButtonDisabled]}
          onPress={handleResend}
          disabled={resendCooldown > 0 || isLoading}
        >
          <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
            {resendCooldown > 0
              ? `Wyślij kod ponownie (${resendCooldown}s)`
              : 'Wyślij kod ponownie'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>Wróć</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 8,
    marginBottom: 32,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: '#f9f9f9',
  },
  codeInputFilled: {
    borderColor: '#007AFF',
    backgroundColor: '#fff',
  },
  codeInputError: {
    borderColor: '#ff3b30',
  },
  error: {
    color: '#ff3b30',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  loading: {
    color: '#007AFF',
    fontSize: 16,
    marginBottom: 16,
  },
  hint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 24,
  },
  resendButton: {
    marginTop: 16,
    padding: 12,
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendText: {
    color: '#007AFF',
    fontSize: 16,
  },
  resendTextDisabled: {
    color: '#999',
  },
  backButton: {
    marginTop: 8,
    padding: 12,
  },
  backText: {
    color: '#666',
    fontSize: 16,
  },
});
