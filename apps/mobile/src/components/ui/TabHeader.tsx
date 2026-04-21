import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, layout, spacing } from "@/theme";

interface IconComponentProps {
  size?: number;
  color?: string;
}

interface TabHeaderProps {
  title: string;
  rightAction?: {
    Icon: ComponentType<IconComponentProps>;
    onPress: () => void;
    testID?: string;
  };
}

const SLOT_WIDTH = 24;
const ICON_SIZE = 20;

export function TabHeader({ title, rightAction }: TabHeaderProps) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.row}>
        <View style={styles.slot} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.slot}>
          {rightAction ? (
            <Pressable testID={rightAction.testID} onPress={rightAction.onPress} hitSlop={8}>
              <rightAction.Icon size={ICON_SIZE} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.section,
    height: layout.headerHeight,
  },
  slot: {
    width: SLOT_WIDTH,
    alignItems: "flex-end",
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.ink,
    textAlign: "center",
    flex: 1,
  },
});
