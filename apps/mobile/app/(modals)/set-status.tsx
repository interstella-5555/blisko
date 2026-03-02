import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { trpc } from '../../src/lib/trpc';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';

type Duration = '1h' | '6h' | '24h' | 'never';

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: 'never', label: 'Do odwołania' },
];

export default function SetStatusScreen() {
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const setProfile = useAuthStore((state) => state.setProfile);

  const [text, setText] = useState(prefill || '');
  const [duration, setDuration] = useState<Duration>('6h');

  const utils = trpc.useUtils();
  const setStatus = trpc.profiles.setStatus.useMutation({
    onSuccess: (data) => {
      if (data) setProfile(data);
      utils.profiles.me.invalidate();
      router.back();
    },
    onError: () => {
      Alert.alert('Błąd', 'Nie udało się ustawić statusu');
    },
  });

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus.mutate({ text: trimmed, expiresIn: duration });
  };

  const canSubmit = text.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Co teraz?</Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Czego szukasz lub co możesz dać?"
            placeholderTextColor={colors.muted}
            spellCheck={false}
            autoCorrect={false}
            multiline
            maxLength={150}
            autoFocus
          />
          <Text style={styles.charCount}>{text.length} / 150</Text>
        </View>

        <Text style={styles.durationLabel}>CZAS TRWANIA</Text>
        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.durationChip,
                duration === opt.value && styles.durationChipSelected,
              ]}
              onPress={() => setDuration(opt.value)}
            >
              <Text
                style={[
                  styles.durationChipText,
                  duration === opt.value && styles.durationChipTextSelected,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.submitContainer}>
          <Button
            title="Ustaw status"
            variant="accent"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={setStatus.isPending}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.section,
    paddingBottom: 60,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginBottom: spacing.section,
  },
  inputContainer: {
    marginBottom: spacing.section,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingVertical: 12,
    paddingHorizontal: 0,
    minHeight: 48,
  },
  charCount: {
    ...typ.caption,
    textAlign: 'right',
    marginTop: spacing.hairline,
  },
  durationLabel: {
    ...typ.label,
    marginBottom: spacing.gutter,
  },
  durationRow: {
    flexDirection: 'row',
    gap: spacing.tight,
    flexWrap: 'wrap',
    marginBottom: spacing.block,
  },
  durationChip: {
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  durationChipSelected: {
    backgroundColor: '#D4851C',
    borderColor: '#D4851C',
  },
  durationChipText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.ink,
  },
  durationChipTextSelected: {
    color: '#FFFFFF',
  },
  submitContainer: {
    marginTop: spacing.column,
  },
});
