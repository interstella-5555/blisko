import { StyleSheet, Switch, Text, View } from "react-native";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { colors, fonts, spacing } from "@/theme";

export default function FiltersScreen() {
  const photoOnly = usePreferencesStore((s) => s.photoOnly);
  const setPhotoOnly = usePreferencesStore((s) => s.setPhotoOnly);
  const showAllNearby = usePreferencesStore((s) => s.showAllNearby);
  const setShowAllNearby = usePreferencesStore((s) => s.setShowAllNearby);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Filtry</Text>
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Tylko ze zdjęciem</Text>
          <Text style={styles.toggleDesc}>Pokazuj osoby, które mają zdjęcie profilowe</Text>
        </View>
        <Switch
          value={photoOnly}
          onValueChange={setPhotoOnly}
          trackColor={{ false: "#C0BAA8", true: colors.ink }}
          thumbColor="#FFFFFF"
        />
      </View>
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Pokaż wszystkich w promieniu</Text>
          <Text style={styles.toggleDesc}>Wyłącz, aby lista pokazywała tylko osoby widoczne na mapie</Text>
        </View>
        <Switch
          value={showAllNearby}
          onValueChange={setShowAllNearby}
          trackColor={{ false: "#C0BAA8", true: colors.ink }}
          thumbColor="#FFFFFF"
        />
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.gutter,
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.column,
  },
  toggleLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  toggleDesc: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
});
