import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { NotificationOverlay } from '../../src/components/ui/NotificationOverlay';
import { IconChevronLeft } from '@/components/ui/icons';

export default function ModalsLayout() {
  return (
    <>
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
          options={{ title: 'Grupa' }}
        />
        <Stack.Screen
          name="group/members/[id]"
          options={{ title: 'Członkowie' }}
        />
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
