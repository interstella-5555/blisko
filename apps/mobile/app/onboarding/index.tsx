import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useOnboardingStore } from '../../src/stores/onboardingStore';

export default function OnboardingNameScreen() {
  const { displayName, setDisplayName } = useOnboardingStore();
  const [name, setName] = useState(displayName);

  const handleNext = () => {
    if (name.trim().length < 2) return;
    setDisplayName(name.trim());
    router.push('/onboarding/bio');
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

        <TextInput
          testID="name-input"
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Twoje imie"
          autoCapitalize="words"
          autoFocus
          maxLength={30}
        />

        <TouchableOpacity
          style={[styles.button, name.trim().length < 2 && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={name.trim().length < 2}
        >
          <Text style={styles.buttonText}>Dalej</Text>
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
    paddingHorizontal: 24,
    paddingTop: 100,
  },
  step: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
