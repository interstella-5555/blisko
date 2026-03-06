import { Stack } from 'expo-router';
import { colors, type as typ } from '../../src/theme';
import { NotificationOverlay } from '../../src/components/ui/NotificationOverlay';

export default function ModalsLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { fontFamily: typ.heading.fontFamily, fontSize: 18 },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="user/[userId]"
          options={{ title: 'Profil' }}
        />
        <Stack.Screen
          name="create-group"
          options={{ title: 'Nowa grupa' }}
        />
        <Stack.Screen
          name="group/[id]"
          options={{ title: 'Grupa', headerBackTitle: 'Wróć' }}
        />
        <Stack.Screen
          name="group/members/[id]"
          options={{ title: 'Członkowie', headerBackTitle: 'Wróć' }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{ title: 'Czat' }}
        />
      </Stack>
      <NotificationOverlay />
    </>
  );
}
