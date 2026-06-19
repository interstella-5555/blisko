import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Trans, useLingui } from "@lingui/react/macro";
import { STATUS_CATEGORIES, type StatusCategory } from "@repo/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

export default function SetStatusScreen() {
  const { t } = useLingui();
  const { prefill, prefillCategories } = useLocalSearchParams<{
    prefill?: string;
    prefillCategories?: string;
  }>();

  const CATEGORY_OPTIONS: {
    value: StatusCategory;
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }[] = [
    { value: "project", label: t`Projekt`, icon: "lightbulb-outline" },
    { value: "networking", label: t`Networking`, icon: "account-multiple-outline" },
    { value: "dating", label: t`Spotkanie`, icon: "coffee-outline" },
    { value: "casual", label: t`Hobby`, icon: "tennis" },
  ];
  const setProfile = useAuthStore((state) => state.setProfile);
  const [text, setText] = useState(prefill || "");
  const [categories, setCategories] = useState<StatusCategory[]>(() => {
    if (!prefillCategories) return [];
    return prefillCategories
      .split(",")
      .filter((c): c is StatusCategory => STATUS_CATEGORIES.includes(c as StatusCategory));
  });

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
      Alert.alert(t`Błąd`, t`Nie udało się wyczyścić statusu`);
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
      });
    }
    router.back();

    setStatus.mutate(
      { text: trimmed, categories },
      {
        onError: () => {
          if (previousProfile) setProfile(previousProfile);
          Alert.alert(t`Błąd`, t`Nie udało się ustawić statusu`);
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
      });
    }
    router.back();
    clearStatus.mutate(undefined, {
      onError: () => {
        if (previousProfile) setProfile(previousProfile);
      },
    });
  };

  const canSubmit = text.trim().length > 0 && categories.length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        <Trans>Co teraz?</Trans>
      </Text>

      <Text style={styles.sectionLabel}>
        <Trans>KATEGORIA (max 2)</Trans>
      </Text>
      <View style={styles.categoryRow}>
        {CATEGORY_OPTIONS.map((cat) => {
          const selected = categories.includes(cat.value);
          return (
            <Pressable
              key={cat.value}
              style={[styles.categoryTile, selected && styles.categoryTileSelected]}
              onPress={() => toggleCategory(cat.value)}
            >
              <View style={styles.categoryIcon}>
                <MaterialCommunityIcons name={cat.icon} size={24} color={selected ? "#D4851C" : colors.muted} />
              </View>
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
          placeholder={t`Czego szukasz lub co możesz dać?`}
          placeholderTextColor={colors.muted}
          spellCheck={false}
          autoCorrect={false}
          multiline
          maxLength={150}
          autoFocus
        />
        <Text style={styles.charCount}>{text.length} / 150</Text>
      </View>

      <View style={styles.submitContainer}>
        <Button
          title={t`Ustaw status`}
          variant="accent"
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={setStatus.isPending}
        />
        {isEditing && (
          <Pressable onPress={handleClear} style={styles.clearButton} hitSlop={8}>
            <Text style={styles.clearText}>
              <Trans>Wyczyść status</Trans>
            </Text>
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
  categoryIcon: {
    height: 24,
    justifyContent: "center",
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
  },
  clearButton: {
    alignSelf: "center",
    paddingVertical: spacing.tight,
  },
  clearText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
  },
});
