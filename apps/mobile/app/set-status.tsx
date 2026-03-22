import { router, useLocalSearchParams } from "expo-router";
import ms from "ms";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

type Duration = "1h" | "6h" | "24h" | "never";

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "never", label: "Do odwołania" },
];

type Visibility = "public" | "private";

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Publiczny" },
  { value: "private", label: "Prywatny" },
];

export default function SetStatusScreen() {
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const setProfile = useAuthStore((state) => state.setProfile);
  const [text, setText] = useState(prefill || "");
  const [duration, setDuration] = useState<Duration>("6h");
  const [visibility, setVisibility] = useState<Visibility>("public");

  const isEditing = !!prefill;

  const utils = trpc.useUtils();
  const invalidateAfterStatusChange = () => {
    utils.profiles.me.invalidate();
    utils.profiles.getNearbyUsersForMap.invalidate();
  };

  const setStatus = trpc.profiles.setStatus.useMutation({
    onSuccess: (data) => {
      if (data) setProfile(data);
      invalidateAfterStatusChange();
    },
  });
  const clearStatus = trpc.profiles.clearStatus.useMutation({
    onSuccess: (data) => {
      if (data) setProfile(data);
      invalidateAfterStatusChange();
    },
    onError: () => {
      Alert.alert("Błąd", "Nie udało się wyczyścić statusu");
    },
  });

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Optimistic: update profile store + navigate back immediately
    const previousProfile = useAuthStore.getState().profile;
    if (previousProfile) {
      setProfile({
        ...previousProfile,
        currentStatus: trimmed,
        statusExpiresAt: duration === "never" ? null : new Date(Date.now() + ms(duration)).toISOString(),
        statusSetAt: new Date().toISOString(),
        statusVisibility: visibility,
      });
    }
    router.back();

    setStatus.mutate(
      { text: trimmed, expiresIn: duration, visibility },
      {
        onError: () => {
          if (previousProfile) setProfile(previousProfile);
          Alert.alert("Błąd", "Nie udało się ustawić statusu");
        },
      },
    );
  };

  const handleClear = () => {
    const previousProfile = useAuthStore.getState().profile;
    if (previousProfile) {
      setProfile({
        ...previousProfile,
        currentStatus: null,
        statusExpiresAt: null,
        statusSetAt: null,
        statusVisibility: null,
      });
    }
    router.back();
    clearStatus.mutate(undefined, {
      onError: () => {
        if (previousProfile) setProfile(previousProfile);
      },
    });
  };

  const canSubmit = text.trim().length > 0;

  return (
    <View style={styles.container}>
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

      <Text style={styles.sectionLabel}>CZAS TRWANIA</Text>
      <View style={styles.chipRow}>
        {DURATION_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.chip, duration === opt.value && styles.chipSelected]}
            onPress={() => setDuration(opt.value)}
          >
            <Text style={[styles.chipText, duration === opt.value && styles.chipTextSelected]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>WIDOCZNOŚĆ</Text>
      <View style={styles.chipRow}>
        {VISIBILITY_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.chip, visibility === opt.value && styles.chipSelected]}
            onPress={() => setVisibility(opt.value)}
          >
            <Text style={[styles.chipText, visibility === opt.value && styles.chipTextSelected]}>{opt.label}</Text>
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
        {isEditing && (
          <Pressable onPress={handleClear} style={styles.clearButton} hitSlop={8}>
            <Text style={styles.clearText}>Wyczyść status</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.section,
    paddingTop: spacing.section,
    paddingBottom: spacing.block,
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
    textAlign: "right",
    marginTop: spacing.hairline,
  },
  sectionLabel: {
    ...typ.label,
    marginBottom: spacing.gutter,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.tight,
    flexWrap: "wrap",
    marginBottom: spacing.block,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  chipSelected: {
    backgroundColor: "#D4851C",
    borderColor: "#D4851C",
  },
  chipText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.ink,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  submitContainer: {
    marginTop: spacing.column,
    gap: spacing.column,
    alignItems: "center",
  },
  clearButton: {
    paddingVertical: spacing.tight,
  },
  clearText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
  },
});
