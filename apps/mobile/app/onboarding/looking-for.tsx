import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import { trpc } from '../../src/lib/trpc';

export default function OnboardingLookingForScreen() {
  const { displayName, bio, lookingFor, setLookingFor, complete } = useOnboardingStore();
  const [text, setText] = useState(lookingFor);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const createProfile = trpc.profiles.create.useMutation();

  const handleSubmit = async () => {
    if (text.trim().length < 10) return;

    setLookingFor(text.trim());
    setIsSubmitting(true);
    setError('');

    try {
      await createProfile.mutateAsync({
        displayName,
        bio,
        lookingFor: text.trim(),
      });
      complete();
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Failed to create profile:', err);
      setError('Nie udalo sie utworzyc profilu. Sprobuj ponownie.');
    } finally {
      setIsSubmitting(false);
    }
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

        <Text style={styles.step}>3 / 3</Text>
        <Text style={styles.title}>Kogo szukasz?</Text>
        <Text style={styles.subtitle}>
          Opisz jakiej osoby szukasz. Co was mogloby polaczyc?
        </Text>

        <TextInput
          testID="looking-for-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Szukam kogos kto..."
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          maxLength={500}
        />
        <Text style={styles.charCount}>{text.length} / 500</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[
            styles.button,
            (text.trim().length < 10 || isSubmitting) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={text.trim().length < 10 || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Rozpocznij</Text>
          )}
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
    marginBottom: 16,
  },
  error: {
    color: '#ff3b30',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
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
