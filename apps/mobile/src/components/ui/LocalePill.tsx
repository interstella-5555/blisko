import { LOCALE_CODES, type LocaleCode } from "@repo/shared";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, fonts } from "@/theme";

const LABELS: Record<LocaleCode, string> = {
  pl: "PL",
  uk: "UA",
};

interface Props {
  value: LocaleCode;
  onChange: (next: LocaleCode) => void;
  style?: ViewStyle;
}

export function LocalePill({ value, onChange, style }: Props) {
  return (
    <View style={[styles.pill, style]}>
      {LOCALE_CODES.map((code) => {
        const isActive = value === code;
        return (
          <Pressable
            key={code}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={LABELS[code]}
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (isActive) return;
              Haptics.selectionAsync();
              onChange(code);
            }}
            style={[styles.btn, isActive && styles.btnActive]}
          >
            <Text style={[styles.text, isActive && styles.textActive]}>{LABELS[code]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    backgroundColor: "rgba(213, 208, 196, 0.35)",
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 999,
    padding: 3,
    alignSelf: "flex-start",
  },
  btn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  btnActive: {
    backgroundColor: colors.ink,
  },
  text: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
    textTransform: "uppercase",
  },
  textActive: {
    color: colors.bg,
  },
});
