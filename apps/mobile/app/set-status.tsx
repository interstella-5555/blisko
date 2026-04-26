import { MaterialCommunityIcons } from "@expo/vector-icons";
import { STATUS_CATEGORIES, type StatusCategory } from "@repo/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { IconHelp } from "@/components/ui/icons";
import { Toggle } from "@/components/ui/Toggle";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";

type Visibility = "public" | "private";

const VISIBILITY_HELP =
  "Publiczny — tekst statusu + kategorie widoczne dla innych na mapie i w profilu. Dopasowania liczone są DO tekstu statusu.\n\nPrywatny — tekst statusu ukryty przed innymi, ale wciąż wpływa na to z kim się matchujesz. Dopasowania liczone są do Twojego profilu.";

const CATEGORY_OPTIONS: {
  value: StatusCategory;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { value: "project", label: "Projekt", icon: "lightbulb-outline" },
  { value: "networking", label: "Networking", icon: "account-multiple-outline" },
  { value: "dating", label: "Spotkanie", icon: "coffee-outline" },
  { value: "casual", label: "Hobby", icon: "tennis" },
];

export default function SetStatusScreen() {
  const { prefill, prefillVisibility, prefillCategories } = useLocalSearchParams<{
    prefill?: string;
    prefillVisibility?: string;
    prefillCategories?: string;
  }>();
  const setProfile = useAuthStore((state) => state.setProfile);
  const [text, setText] = useState(prefill || "");
  const [visibility, setVisibility] = useState<Visibility>(
    prefillVisibility === "public" || prefillVisibility === "private" ? prefillVisibility : "public",
  );
  const [showHelp, setShowHelp] = useState(false);
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
      { text: trimmed, visibility, categories },
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

  const canSubmit = text.trim().length > 0 && categories.length > 0;

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

      <View style={styles.visibilityRow}>
        <Text style={[styles.sectionLabel, styles.inlineLabel]}>WIDOCZNOŚĆ</Text>
        <View style={styles.visibilityControls}>
          <Pressable onPress={() => setShowHelp((s) => !s)} hitSlop={8}>
            <IconHelp size={16} color={colors.muted} />
          </Pressable>
          <Toggle
            value={visibility === "public"}
            onValueChange={(v) => setVisibility(v ? "public" : "private")}
            labels={{ off: "Prywatny", on: "Publiczny" }}
          />
        </View>
      </View>
      {showHelp && <Text style={styles.helpText}>{VISIBILITY_HELP}</Text>}

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
  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.tight,
  },
  visibilityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inlineLabel: {
    marginBottom: 0,
  },
  helpText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
    marginBottom: spacing.block,
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
