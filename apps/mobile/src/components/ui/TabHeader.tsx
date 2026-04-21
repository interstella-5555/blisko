import { router } from "expo-router";
import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconChevronLeft } from "@/components/ui/icons";
import { colors, fonts, layout, spacing } from "@/theme";

interface IconComponentProps {
  size?: number;
  color?: string;
}

interface ActionConfig {
  Icon: ComponentType<IconComponentProps>;
  onPress: () => void;
  testID?: string;
}

type LeftAction = ActionConfig | "back";

interface TabHeaderProps {
  title: string;
  leftAction?: LeftAction;
  rightAction?: ActionConfig;
}

const SLOT_WIDTH = 24;
const LEFT_ICON_SIZE = 24;
const RIGHT_ICON_SIZE = 20;

function resolveLeftAction(leftAction: LeftAction | undefined): ActionConfig | null {
  if (!leftAction) return null;
  if (leftAction === "back") {
    return { Icon: IconChevronLeft, onPress: () => router.back() };
  }
  return leftAction;
}

export function TabHeader({ title, leftAction, rightAction }: TabHeaderProps) {
  const left = resolveLeftAction(leftAction);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.row}>
        <View style={styles.slotLeft}>
          {left ? (
            <Pressable testID={left.testID} onPress={left.onPress} hitSlop={8}>
              <left.Icon size={LEFT_ICON_SIZE} color={colors.ink} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.slotRight}>
          {rightAction ? (
            <Pressable testID={rightAction.testID} onPress={rightAction.onPress} hitSlop={8}>
              <rightAction.Icon size={RIGHT_ICON_SIZE} color={colors.muted} />
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
  slotLeft: {
    width: SLOT_WIDTH,
  },
  slotRight: {
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
