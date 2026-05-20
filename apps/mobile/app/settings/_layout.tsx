import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";
import { TabHeader } from "@/components/ui/TabHeader";
import { colors } from "@/theme";

export default function SettingsLayout() {
  const { t } = useLingui();
  return (
    <Stack
      screenOptions={{
        header: ({ options }) => <TabHeader title={options.title ?? ""} leftAction="back" />,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: t`Ustawienia` }} />
      <Stack.Screen name="profile" options={{ title: t`Profil` }} />
      <Stack.Screen name="edit-profile" options={{ title: t`Edytuj profil` }} />
      <Stack.Screen name="profiling" options={{ title: t`Profilowanie` }} />
      <Stack.Screen name="profiling-result" options={{ title: t`Wynik profilowania` }} />
      <Stack.Screen name="account" options={{ title: t`Konto` }} />
      <Stack.Screen name="change-email" options={{ title: t`Zmień email` }} />
      <Stack.Screen name="verify-email" options={{ title: t`Weryfikacja` }} />
      <Stack.Screen name="privacy" options={{ title: t`Prywatność` }} />
      <Stack.Screen name="blocked-users" options={{ title: t`Zablokowani` }} />
      <Stack.Screen name="notifications" options={{ title: t`Powiadomienia` }} />
      <Stack.Screen name="help" options={{ title: t`Pomoc` }} />
    </Stack>
  );
}
