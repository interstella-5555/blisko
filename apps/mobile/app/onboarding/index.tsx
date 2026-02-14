import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { colors, type as typ, spacing } from '../../src/theme';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';

export default function OnboardingNameScreen() {
  const { displayName, setDisplayName } = useOnboardingStore();
  const [name, setName] = useState(displayName);

  const handleNext = () => {
    if (name.trim().length < 2) return;
    setDisplayName(name.trim());
    router.push('/onboarding/profile-method');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.step}>1 / 3</Text>
        <Text style={styles.title}>Jak masz na imie?</Text>
        <Text style={styles.subtitle}>
          To imie bedzie widoczne dla innych uzytkownikow
        </Text>

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
          <Button
            title="Dalej"
            variant="accent"
            onPress={handleNext}
            disabled={name.trim().length < 2}
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
    paddingTop: 100,
  },
  step: {
    ...typ.caption,
    marginBottom: spacing.tight,
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
