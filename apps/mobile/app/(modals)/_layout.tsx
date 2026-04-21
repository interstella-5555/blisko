import { Stack } from "expo-router";
import { TabHeader } from "@/components/ui/TabHeader";
import { colors } from "@/theme";

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        header: ({ options }) => <TabHeader title={options.title ?? ""} leftAction="back" />,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="user/[userId]" options={{ title: "Profil" }} />
      <Stack.Screen name="group/[id]" options={{ title: "Grupa" }} />
      <Stack.Screen name="group/members/[id]" options={{ title: "Członkowie" }} />
    </Stack>
  );
}
