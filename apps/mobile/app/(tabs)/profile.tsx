import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { authClient } from '../../src/lib/auth';
import { trpc } from '../../src/lib/trpc';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const reset = useAuthStore((state) => state.reset);

  const [isHidden, setIsHidden] = useState(profile?.isHidden ?? false);

  const utils = trpc.useUtils();
  const updateProfile = trpc.profiles.update.useMutation({
    onSuccess: (data) => {
      if (data) setProfile(data);
      utils.profiles.me.invalidate();
    },
  });

  const handleToggleHidden = (value: boolean) => {
    setIsHidden(value);
    updateProfile.mutate({ isHidden: value });
  };

  const handleLogout = async () => {
    await authClient.signOut();
    reset();
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Avatar
          uri={profile?.avatarUrl}
          name={profile?.displayName || user?.email?.charAt(0) || '?'}
          size={100}
        />
        <Text testID="profile-display-name" style={styles.displayName}>
          {profile?.displayName || 'Brak nazwy'}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>O mnie</Text>
        <Text testID="profile-bio" style={styles.sectionContent}>
          {profile?.bio || 'Brak opisu'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kogo szukam</Text>
        <Text testID="profile-looking-for" style={styles.sectionContent}>
          {profile?.lookingFor || 'Brak opisu'}
        </Text>
      </View>

      <View style={styles.editContainer}>
        <Button
          testID="edit-profile-btn"
          title="Edytuj profil"
          variant="accent"
          onPress={() => router.push('/(modals)/edit-profile')}
        />
      </View>

      <View style={styles.privacySection}>
        <View style={styles.privacyRow}>
          <View style={styles.privacyText}>
            <Text style={styles.privacyLabel}>Ukryj moj profil</Text>
            <Text style={styles.privacyDescription}>
              Twoj profil nie bedzie widoczny na mapie ani w wynikach wyszukiwania
            </Text>
          </View>
          <Switch
            testID="privacy-toggle"
            value={isHidden}
            onValueChange={handleToggleHidden}
            trackColor={{ false: colors.rule, true: colors.accent }}
            thumbColor={colors.bg}
          />
        </View>
      </View>

      <View style={styles.logoutContainer}>
        <Button
          title="Wyloguj sie"
          variant="ghost"
          onPress={handleLogout}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.block,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  displayName: {
    ...typ.heading,
    marginTop: spacing.column,
  },
  email: {
    ...typ.caption,
    marginTop: spacing.hairline,
  },
  section: {
    padding: spacing.section,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  sectionTitle: {
    ...typ.label,
    marginBottom: spacing.tight,
  },
  sectionContent: {
    ...typ.body,
  },
  editContainer: {
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.column,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  privacySection: {
    padding: spacing.section,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privacyText: {
    flex: 1,
    marginRight: spacing.column,
  },
  privacyLabel: {
    ...typ.body,
    fontFamily: fonts.sansSemiBold,
  },
  privacyDescription: {
    ...typ.caption,
    marginTop: spacing.hairline,
  },
  logoutContainer: {
    alignItems: 'center',
    paddingVertical: spacing.block,
  },
});
