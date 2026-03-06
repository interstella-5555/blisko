import { Pressable } from 'react-native';
import { Stack, router } from 'expo-router';
import { colors, type as typ, spacing } from '../../src/theme';
import { IconArrowLeft } from '../../src/components/ui/icons';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontFamily: typ.heading.fontFamily, fontSize: typ.heading.fontSize },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerBackTitle: 'Wróć',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Ustawienia',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginRight: spacing.tight }}>
              <IconArrowLeft size={20} color={colors.ink} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="profile" options={{ title: 'Profil' }} />
      <Stack.Screen name="edit-profile" options={{ title: 'Edytuj profil' }} />
      <Stack.Screen name="profiling" options={{ title: 'Profilowanie' }} />
      <Stack.Screen name="profiling-result" options={{ title: 'Wynik profilowania' }} />
      <Stack.Screen name="set-status" options={{ title: 'Ustaw status' }} />
      <Stack.Screen name="account" options={{ title: 'Konto' }} />
      <Stack.Screen name="privacy" options={{ title: 'Prywatność' }} />
      <Stack.Screen name="notifications" options={{ title: 'Powiadomienia' }} />
      <Stack.Screen name="help" options={{ title: 'Pomoc' }} />
    </Stack>
  );
}
