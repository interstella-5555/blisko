import { useLingui } from "@lingui/react/macro";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { IconChevronRight } from "@/components/ui/icons";
import { colors, fonts, spacing } from "@/theme";

interface RowProps {
  label: string;
  onPress: () => void;
}

function Row({ label, onPress }: RowProps) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <IconChevronRight size={16} color={colors.muted} />
    </Pressable>
  );
}

export default function HelpScreen() {
  const { t } = useLingui();
  return (
    <View style={styles.container}>
      <Row label={t`Jak to działa?`} onPress={() => Alert.alert(t`Wkrótce!`)} />
      <Row
        label={t`Zgłoś problem`}
        onPress={() =>
          Linking.openURL(`mailto:kontakt@blisko.app?subject=${encodeURIComponent(t`Zgłoszenie problemu`)}`)
        }
      />
      <Row label={t`Regulamin`} onPress={() => Linking.openURL("https://blisko.app/terms")} />
      <Row label={t`Polityka prywatności`} onPress={() => Linking.openURL("https://blisko.app/privacy")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: spacing.tight,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.column,
    paddingHorizontal: spacing.section,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
});
