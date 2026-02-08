import { Stack } from 'expo-router';
import { colors, type as typ } from '../../src/theme';

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { ...typ.heading, fontSize: 18 },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen
        name="edit-profile"
        options={{ title: 'Edytuj profil' }}
      />
    </Stack>
  );
}
