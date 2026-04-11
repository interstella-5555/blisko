import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { IconChevronRight } from "../../src/components/ui/icons";
import { trpc } from "../../src/lib/trpc";
import { useAuthStore } from "../../src/stores/authStore";
import { colors, fonts, spacing, type as typ } from "../../src/theme";

type VisibilityMode = "ninja" | "semi_open" | "full_nomad";

const VISIBILITY_OPTIONS: { key: VisibilityMode; name: string; desc: string }[] = [
  {
    key: "ninja",
    name: "Ninja",
    desc: "Widzisz innych, ale Ciebie nie widać na mapie. Nie możesz pingować.",
  },
  {
    key: "semi_open",
    name: "Semi-Open",
    desc: "Widoczny na mapie. Możesz pingować i być pingowany.",
  },
  {
    key: "full_nomad",
    name: "Full Nomad",
    desc: 'Widoczny i otwarty — w profilu pojawi się "Podejdź śmiało".',
  },
];

export default function PrivacyScreen() {
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);

  const [mode, setMode] = useState<VisibilityMode>(profile?.visibilityMode ?? "semi_open");
  const [dnd, setDnd] = useState(profile?.doNotDisturb ?? false);

  const utils = trpc.useUtils();
  const updateProfile = trpc.profiles.update.useMutation({
    onSuccess: (data) => {
      if (data) setProfile(data);
      utils.profiles.me.invalidate();
    },
  });

  const handleChangeMode = (newMode: VisibilityMode) => {
    setMode(newMode);
    updateProfile.mutate({ visibilityMode: newMode });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Visibility mode section */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TRYB WIDOCZNOSCI</Text>
        {VISIBILITY_OPTIONS.map((opt) => (
          <Pressable key={opt.key} style={styles.option} onPress={() => handleChangeMode(opt.key)}>
            <View style={[styles.radio, mode === opt.key && styles.radioSelected]}>
              {mode === opt.key && <View style={styles.radioDot} />}
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionName, mode !== opt.key && styles.dimmed]}>{opt.name}</Text>
              <Text style={[styles.optionDesc, mode !== opt.key && styles.dimmed]}>{opt.desc}</Text>
            </View>
          </Pressable>
        ))}
        <Text style={styles.note}>Zmiana trybu widocznosci nie wplywa na istniejace rozmowy i dopasowania.</Text>
      </View>

      {/* DND toggle */}
      <View style={styles.section}>
        <View style={styles.dndRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionName}>Nie przeszkadzać</Text>
            <Text style={styles.optionDesc}>Pingi dochodzą, ale powiadomienia push wyciszone.</Text>
          </View>
          <Switch
            value={dnd}
            onValueChange={(v) => {
              setDnd(v);
              updateProfile.mutate({ doNotDisturb: v });
            }}
            trackColor={{ false: colors.rule, true: "#D4851C" }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* Blocked users section */}
      <View style={styles.section}>
        <Pressable style={styles.blockedRow} onPress={() => router.push("/settings/blocked-users" as never)}>
          <Text style={styles.blockedLabel}>Zablokowani uzytkownicy</Text>
          <IconChevronRight size={16} color={colors.muted} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  section: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.column,
  },
  sectionLabel: {
    ...typ.label,
    marginBottom: spacing.gutter,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.gutter,
    paddingVertical: spacing.compact,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioSelected: {
    borderColor: colors.ink,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  optionInfo: {
    flex: 1,
  },
  optionName: {
    ...typ.body,
    fontFamily: fonts.sansMedium,
    marginBottom: 2,
  },
  optionDesc: {
    ...typ.caption,
    color: colors.muted,
    lineHeight: 18,
  },
  dimmed: {
    opacity: 0.5,
  },
  note: {
    ...typ.caption,
    color: colors.muted,
    paddingVertical: spacing.gutter,
    lineHeight: 18,
  },
  dndRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    paddingVertical: spacing.compact,
  },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.column,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  blockedLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
});
