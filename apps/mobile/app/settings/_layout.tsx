import { Stack } from "expo-router";
import { TabHeader } from "@/components/ui/TabHeader";
import { colors } from "@/theme";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        header: ({ options }) => <TabHeader title={options.title ?? ""} leftAction="back" />,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Ustawienia" }} />
      <Stack.Screen name="profile" options={{ title: "Profil" }} />
      <Stack.Screen name="edit-profile" options={{ title: "Edytuj profil" }} />
      <Stack.Screen name="profiling" options={{ title: "Profilowanie" }} />
      <Stack.Screen name="profiling-result" options={{ title: "Wynik profilowania" }} />
      <Stack.Screen name="account" options={{ title: "Konto" }} />
      <Stack.Screen name="change-email" options={{ title: "Zmień email" }} />
      <Stack.Screen name="verify-email" options={{ title: "Weryfikacja" }} />
      <Stack.Screen name="privacy" options={{ title: "Prywatność" }} />
      <Stack.Screen name="blocked-users" options={{ title: "Zablokowani" }} />
      <Stack.Screen name="notifications" options={{ title: "Powiadomienia" }} />
      <Stack.Screen name="help" options={{ title: "Pomoc" }} />
    </Stack>
  );
}
