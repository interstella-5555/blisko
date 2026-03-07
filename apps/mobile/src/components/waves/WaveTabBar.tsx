import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts, spacing } from "../../theme";
import { CounterBadge } from "../ui/Badge";

export type WaveTab = "received" | "sent";

interface WaveTabBarProps {
  activeTab: WaveTab;
  onTabChange: (tab: WaveTab) => void;
  receivedCount?: number;
  sentCount?: number;
}

export function WaveTabBar({ activeTab, onTabChange, receivedCount = 0, sentCount = 0 }: WaveTabBarProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        testID="waves-tab-received"
        style={[styles.tab, activeTab === "received" && styles.activeTab]}
        onPress={() => onTabChange("received")}
      >
        <Text style={[styles.tabText, activeTab === "received" && styles.activeTabText]}>OTRZYMANE</Text>
        <CounterBadge count={receivedCount} type="received" />
      </TouchableOpacity>

      <TouchableOpacity
        testID="waves-tab-sent"
        style={[styles.tab, activeTab === "sent" && styles.activeTab]}
        onPress={() => onTabChange("sent")}
      >
        <Text style={[styles.tabText, activeTab === "sent" && styles.activeTabText]}>WYSŁANE</Text>
        <CounterBadge count={sentCount} type="sent" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.column,
    paddingVertical: spacing.tight,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.gutter,
  },
  activeTab: {},
  tabText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
  },
  activeTabText: {
    color: colors.ink,
  },
});
