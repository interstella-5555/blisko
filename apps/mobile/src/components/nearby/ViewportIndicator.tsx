import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";

interface ViewportIndicatorProps {
  viewportCount: number;
  totalCount: number;
  showAll: boolean;
  onToggle: () => void;
}

export function ViewportIndicator({ viewportCount, totalCount, showAll, onToggle }: ViewportIndicatorProps) {
  if (totalCount === 0) return null;

  return (
    <View style={[styles.container, showAll && styles.containerShowAll]}>
      <Text style={[styles.text, showAll && styles.textShowAll]}>
        Pokazujesz{" "}
        <Text style={[styles.bold, showAll && styles.boldShowAll]}>
          {showAll ? `wszystkich ${totalCount}` : `${viewportCount} z ${totalCount}`}
        </Text>{" "}
        osób w okolicy
      </Text>
      <Pressable onPress={onToggle} hitSlop={8}>
        <Text style={styles.btn}>{showAll ? "Wróć do widoku mapy" : "Pokaż wszystkich"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fdfcf9",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  containerShowAll: {
    backgroundColor: colors.ink,
  },
  text: {
    fontSize: 12,
    color: "#888",
    flex: 1,
  },
  textShowAll: {
    color: "#ccc",
  },
  bold: {
    fontWeight: "700",
    color: colors.ink,
  },
  boldShowAll: {
    color: "#fff",
  },
  btn: {
    fontSize: 12,
    fontWeight: "600",
    color: "#efa844",
    textDecorationLine: "underline",
    marginLeft: 8,
  },
});
