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
import Svg, { Path, Rect } from 'react-native-svg';
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
          Świat jest pełen ludzi, którzy siebie potrzebują.{'\n'}My skracamy
          dystans.
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

          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>lub</Text>
            <View style={styles.separatorLine} />
          </View>

          <Pressable
            style={styles.oauthButton}
            onPress={() => authClient.signIn.oauth2({ providerId: 'instagram' })}
            disabled={isLoading}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Rect x={2} y={2} width={20} height={20} rx={5} stroke={colors.ink} strokeWidth={1.8} />
              <Path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" stroke={colors.ink} strokeWidth={1.8} />
              <Path d="M17.5 6.5h.01" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
            </Svg>
            <Text style={styles.oauthButtonText}>Kontynuuj z Instagram</Text>
          </Pressable>

          <Pressable
            style={styles.oauthButton}
            onPress={() => authClient.signIn.social({ provider: 'linkedin' })}
            disabled={isLoading}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z" stroke={colors.ink} strokeWidth={1.8} />
              <Path d="M2 9h4v12H2z" stroke={colors.ink} strokeWidth={1.8} />
              <Path d="M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke={colors.ink} strokeWidth={1.8} />
            </Svg>
            <Text style={styles.oauthButtonText}>Kontynuuj z LinkedIn</Text>
          </Pressable>

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
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.tight,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.rule,
  },
  separatorText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginHorizontal: spacing.gutter,
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.compact,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  oauthButtonText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.ink,
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
