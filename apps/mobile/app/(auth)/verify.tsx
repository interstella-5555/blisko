import { useState, useRef } from 'react';
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
import { useAuthStore } from '../../src/stores/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setSession } = useAuthStore();
  const inputRefs = useRef<(TextInput | null)[]>([]);

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
      const response = await fetch(
        `${API_URL}/api/auth/magic-link/verify?token=${encodeURIComponent(codeToVerify)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || 'Nieprawidłowy kod');
        setIsLoading(false);
        return;
      }

      const data = await response.json();

      if (data.user && data.session) {
        await SecureStore.setItemAsync('meet_session_token', data.session.token);
        await SecureStore.setItemAsync(
          'meet_session_data',
          JSON.stringify({
            session: data.session,
            user: data.user,
          })
        );

        setUser(data.user);
        setSession({
          ...data.session,
          expiresAt: new Date(data.session.expiresAt),
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
              ref={(ref) => (inputRefs.current[index] = ref)}
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
          style={styles.resendButton}
          onPress={() => router.back()}
        >
          <Text style={styles.resendText}>Wyślij kod ponownie</Text>
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
  resendText: {
    color: '#007AFF',
    fontSize: 16,
  },
});
