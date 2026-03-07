import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { colors, fonts, spacing } from "../../src/theme";

function IconChevronRight({ size = 16 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.muted}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Polyline points="9,18 15,12 9,6" />
    </Svg>
  );
}

interface RowProps {
  label: string;
  onPress: () => void;
}

function Row({ label, onPress }: RowProps) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <IconChevronRight />
    </Pressable>
  );
}

export default function HelpScreen() {
  return (
    <View style={styles.container}>
      <Row label="Jak to dziala?" onPress={() => Alert.alert("Wkrotce!")} />
      <Row
        label="Zglos problem"
        onPress={() => Linking.openURL("mailto:support@blisko.app?subject=Zgloszenie problemu")}
      />
      <Row label="Regulamin" onPress={() => Linking.openURL("https://blisko.app/terms")} />
      <Row label="Polityka prywatnosci" onPress={() => Linking.openURL("https://blisko.app/privacy")} />
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
