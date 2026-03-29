import { STATUS_CATEGORIES, type StatusCategory } from "@repo/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

type Visibility = "public" | "private";

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Publiczny" },
  { value: "private", label: "Prywatny" },
];

const CATEGORY_OPTIONS: { value: StatusCategory; label: string; emoji: string }[] = [
  { value: "project", label: "Projekt", emoji: "⚡" },
  { value: "networking", label: "Networking", emoji: "🤝" },
  { value: "dating", label: "Randka", emoji: "🔥" },
  { value: "casual", label: "Casual", emoji: "☕" },
];

export default function SetStatusScreen() {
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const setProfile = useAuthStore((state) => state.setProfile);
  const [text, setText] = useState(prefill || "");
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [categories, setCategories] = useState<StatusCategory[]>([]);

  const toggleCategory = (cat: StatusCategory) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : prev.length < 2 ? [...prev, cat] : prev,
    );
  };

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

    const previousProfile = useAuthStore.getState().profile;
    if (previousProfile) {
      setProfile({
        ...previousProfile,
        currentStatus: trimmed,
        statusSetAt: new Date().toISOString(),
        statusVisibility: visibility,
      });
    }
    router.back();

    setStatus.mutate(
      { text: trimmed, visibility: visibility!, categories },
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

  const canSubmit = text.trim().length > 0 && categories.length > 0 && visibility !== null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Co teraz?</Text>

      <Text style={styles.sectionLabel}>KATEGORIA (max 2)</Text>
      <View style={styles.categoryRow}>
        {CATEGORY_OPTIONS.map((cat) => {
          const selected = categories.includes(cat.value);
          return (
            <Pressable
              key={cat.value}
              style={[styles.categoryTile, selected && styles.categoryTileSelected]}
              onPress={() => toggleCategory(cat.value)}
            >
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}>{cat.label}</Text>
            </Pressable>
          );
        })}
      </View>

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
  categoryRow: {
    flexDirection: "row",
    gap: spacing.gutter,
    marginBottom: spacing.section,
  },
  categoryTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.gutter,
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 12,
  },
  categoryTileSelected: {
    borderColor: "#D4851C",
    backgroundColor: "#FFF8F0",
  },
  categoryEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.muted,
  },
  categoryLabelSelected: {
    color: "#D4851C",
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
