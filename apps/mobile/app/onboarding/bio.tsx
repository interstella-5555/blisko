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

export default function OnboardingBioScreen() {
  const { bio, setBio } = useOnboardingStore();
  const [text, setText] = useState(bio);

  const handleNext = () => {
    if (text.trim().length < 10) return;
    setBio(text.trim());
    router.push('/onboarding/looking-for');
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backText}>Wstecz</Text>
        </TouchableOpacity>

        <Text style={styles.step}>2 / 3</Text>
        <Text style={styles.title}>Opowiedz o sobie</Text>
        <Text style={styles.subtitle}>
          Kim jestes? Czym sie interesujesz? Co lubisz robic?
        </Text>

        <TextInput
          testID="bio-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Napisz kilka slow o sobie..."
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          maxLength={500}
        />
        <Text style={styles.charCount}>{text.length} / 500</Text>

        <TouchableOpacity
          style={[styles.button, text.trim().length < 10 && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={text.trim().length < 10}
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
    paddingTop: 60,
  },
  backButton: {
    marginBottom: 24,
  },
  backText: {
    fontSize: 16,
    color: '#007AFF',
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
    fontSize: 16,
    minHeight: 150,
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
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
