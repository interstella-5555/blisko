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
  return (
    <View style={styles.container}>
      <Row label="Jak to działa?" onPress={() => Alert.alert("Wkrótce!")} />
      <Row
        label="Zgłoś problem"
        onPress={() => Linking.openURL("mailto:support@blisko.app?subject=Zgłoszenie problemu")}
      />
      <Row label="Regulamin" onPress={() => Linking.openURL("https://blisko.app/terms")} />
      <Row label="Polityka prywatności" onPress={() => Linking.openURL("https://blisko.app/privacy")} />
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
