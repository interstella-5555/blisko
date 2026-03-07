import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { IconChevronLeft } from '@/components/ui/icons';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        header: ({ options }) => (
          <SafeAreaView edges={['top']} style={styles.safeArea}>
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
      <Stack.Screen name="index" options={{ title: 'Ustawienia' }} />
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

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
