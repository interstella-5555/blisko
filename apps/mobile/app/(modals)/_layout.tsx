import { router, Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconChevronLeft } from "@/components/ui/icons";
import { NotificationOverlay } from "../../src/components/ui/NotificationOverlay";
import { colors, fonts, spacing } from "../../src/theme";

export default function ModalsLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          header: ({ options }) => (
            <SafeAreaView edges={["top"]} style={styles.safeArea}>
              <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
                  <IconChevronLeft size={24} color={colors.ink} />
                </Pressable>
                <Text style={styles.title}>{options.title}</Text>
                <View style={styles.spacer} />
              </View>
            </SafeAreaView>
          ),
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="user/[userId]" options={{ title: "Profil" }} />
        <Stack.Screen name="group/[id]" options={{ title: "Grupa" }} />
        <Stack.Screen name="group/members/[id]" options={{ title: "Członkowie" }} />
      </Stack>
      <NotificationOverlay />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.section,
    height: 58,
  },
  back: {
    width: 24,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: colors.ink,
  },
  spacer: {
    width: 24,
  },
});
