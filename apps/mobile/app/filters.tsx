import { Trans } from "@lingui/react/macro";
import { StyleSheet, Text, View } from "react-native";
import { Toggle } from "@/components/ui/Toggle";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { colors, fonts, spacing } from "@/theme";

export default function FiltersScreen() {
  const photoOnly = usePreferencesStore((s) => s.photoOnly);
  const setPhotoOnly = usePreferencesStore((s) => s.setPhotoOnly);
  const showAllNearby = usePreferencesStore((s) => s.showAllNearby);
  const setShowAllNearby = usePreferencesStore((s) => s.setShowAllNearby);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        <Trans>Filtry</Trans>
      </Text>
      <View style={styles.toggleBlock}>
        <View style={styles.toggleLabelRow}>
          <Text style={styles.toggleLabel}>
            <Trans>Tylko ze zdjęciem</Trans>
          </Text>
          <Toggle value={photoOnly} onValueChange={setPhotoOnly} />
        </View>
        <Text style={styles.toggleDesc}>
          <Trans>Pokazuj osoby, które mają zdjęcie profilowe</Trans>
        </Text>
      </View>
      <View style={styles.toggleBlock}>
        <View style={styles.toggleLabelRow}>
          <Text style={styles.toggleLabel}>
            <Trans>Pokaż wszystkich w promieniu</Trans>
          </Text>
          <Toggle value={showAllNearby} onValueChange={setShowAllNearby} />
        </View>
        <Text style={styles.toggleDesc}>
          <Trans>Wyłącz, aby lista pokazywała tylko osoby widoczne na mapie</Trans>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.column,
    paddingBottom: spacing.block,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.ink,
    marginBottom: spacing.section,
  },
  toggleBlock: {
    paddingVertical: spacing.gutter,
  },
  toggleLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
    marginRight: spacing.column,
  },
  toggleDesc: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
});
