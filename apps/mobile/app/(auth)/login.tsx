import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { authClient } from '../../src/lib/auth';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser, setSession, setProfile, setHasCheckedProfile } = useAuthStore();

  const seedUserNumber = useMemo(() => Math.floor(Math.random() * 250), []);

  const handleSendMagicLink = async (emailOverride?: string) => {
    const target = (emailOverride || email).trim();
    if (!target) {
      setError('Podaj adres email');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Dev auto-login for @example.com emails
    if (target.endsWith('@example.com')) {
      try {
        const response = await fetch(`${API_URL}/dev/auto-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: target }),
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Auto-login failed');
          setIsLoading(false);
          return;
        }

        const data = await response.json();

        // Save session to SecureStore so authClient.getSession() can read it
        // Better Auth expo client uses this format
        await SecureStore.setItemAsync(
          'blisko_session_token',
          data.session.token
        );
        await SecureStore.setItemAsync(
          'blisko_session_data',
          JSON.stringify({
            session: data.session,
            user: data.user,
          })
        );

        // Reset profile state so query runs fresh
        setProfile(null);
        setHasCheckedProfile(false);

        setUser(data.user);
        setSession({
          ...data.session,
          expiresAt: new Date(data.session.expiresAt),
        });

        router.replace('/(tabs)');
        return;
      } catch (err) {
        setError('Dev auto-login failed');
        setIsLoading(false);
        return;
      }
    }

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: target,
        type: 'sign-in',
      });

      if (result.error) {
        setError(result.error.message || 'Wystąpił błąd');
        setIsLoading(false);
        return;
      }

      router.push({
        pathname: '/(auth)/verify',
        params: { email: target },
      });
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
        <Text style={styles.title}>BLISKO</Text>
        <Text style={styles.subtitle}>
          Poznawaj ludzi o podobnych zainteresowaniach
        </Text>

        <View style={styles.form}>
          <Input
            testID="email-input"
            label="Email"
            placeholder="twoj@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ marginTop: spacing.column }}>
            <Button
              testID="send-link-button"
              title={isLoading ? 'Wysyłanie...' : 'Wyślij link'}
              variant="accent"
              onPress={() => handleSendMagicLink()}
              disabled={isLoading}
              loading={isLoading}
            />
          </View>

          {__DEV__ && (
            <Pressable
              onPress={() => handleSendMagicLink(`user${seedUserNumber}@example.com`)}
              disabled={isLoading}
              style={styles.devLogin}
            >
              <Text style={styles.devLoginText}>
                Użyj testowego konta user{seedUserNumber}@example.com
              </Text>
            </Pressable>
          )}
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
    justifyContent: 'center',
    paddingHorizontal: spacing.section,
  },
  title: {
    ...typ.display,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: spacing.tight,
  },
  subtitle: {
    ...typ.body,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.block + spacing.column,
  },
  form: {
    gap: spacing.column,
  },
  error: {
    fontFamily: fonts.sans,
    color: colors.status.error.text,
    fontSize: 14,
  },
  devLogin: {
    alignSelf: 'center',
    marginTop: spacing.column,
  },
  devLoginText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    textDecorationLine: 'underline',
  },
});
