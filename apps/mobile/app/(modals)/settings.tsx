import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useAuthStore } from '../../src/stores/authStore';
import { trpc } from '../../src/lib/trpc';
import { colors, type as typ, spacing, fonts } from '../../src/theme';

type VisibilityMode = 'visible' | 'matches_only' | 'hidden';

const VISIBILITY_OPTIONS: { key: VisibilityMode; name: string; desc: string }[] = [
  {
    key: 'visible',
    name: 'Widoczny',
    desc: 'Twój profil jest widoczny na mapie i w wynikach wyszukiwania dla wszystkich.',
  },
  {
    key: 'matches_only',
    name: 'Tylko dopasowania',
    desc: 'Nie pojawisz się na mapie. Widzisz innych, ale oni Ciebie tylko po wysłaniu wave.',
  },
  {
    key: 'hidden',
    name: 'Ukryty',
    desc: 'Twój profil jest całkowicie niewidoczny. Nikt Cię nie znajdzie ani nie zobaczy.',
  },
];

export default function SettingsScreen() {
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);

  const [mode, setMode] = useState<VisibilityMode>(profile?.visibilityMode ?? 'visible');

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
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>TRYB WIDOCZNOŚCI</Text>
        {VISIBILITY_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={styles.option}
            onPress={() => handleChangeMode(opt.key)}
          >
            <View style={[styles.radio, mode === opt.key && styles.radioSelected]}>
              {mode === opt.key && <View style={styles.radioDot} />}
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionName, mode !== opt.key && styles.dimmed]}>
                {opt.name}
              </Text>
              <Text style={[styles.optionDesc, mode !== opt.key && styles.dimmed]}>
                {opt.desc}
              </Text>
            </View>
          </Pressable>
        ))}
        <Text style={styles.note}>
          Zmiana trybu widoczności nie wpływa na istniejące rozmowy i dopasowania.
        </Text>
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
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    alignItems: 'center',
    justifyContent: 'center',
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
});
