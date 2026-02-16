import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { useProfilesStore } from '../../src/stores/profilesStore';
import { useConversationsStore } from '../../src/stores/conversationsStore';
import { useMessagesStore } from '../../src/stores/messagesStore';
import { useWavesStore } from '../../src/stores/wavesStore';
import { authClient } from '../../src/lib/auth';
import { trpc } from '../../src/lib/trpc';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { IconSparkles } from '../../src/components/ui/icons';

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
    useProfilesStore.getState().reset();
    useConversationsStore.getState().reset();
    useMessagesStore.getState().reset();
    useWavesStore.getState().reset();
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

      <Pressable
        style={styles.reprofileLink}
        onPress={() => router.push('/(modals)/profiling')}
      >
        <View style={styles.reprofileRow}>
          <IconSparkles size={16} color={colors.muted} />
          <Text style={styles.reprofileTitle}>Wyprobuj automatyczne profilowanie</Text>
        </View>
        <Text style={styles.reprofileDescription}>
          Odpowiedz na kilka pytan — na ich podstawie wygenerujemy nowy opis, sekcje "kogo szukam" i portret osobowosci. Przed zapisaniem mozesz wszystko przejrzec i edytowac.
        </Text>
      </Pressable>

      <View style={styles.privacySection}>
        <View style={styles.privacyRow}>
          <Text style={styles.privacyLabel}>Ukryj moj profil</Text>
          <Switch
            testID="privacy-toggle"
            value={isHidden}
            onValueChange={handleToggleHidden}
            trackColor={{ false: '#C0BAA8', true: colors.accent }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#C0BAA8"
          />
        </View>
        <Text style={styles.privacyDescription}>
          Twoj profil nie bedzie widoczny na mapie ani w wynikach wyszukiwania
        </Text>
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
  reprofileLink: {
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.column,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  reprofileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.tight,
  },
  reprofileTitle: {
    ...typ.caption,
    color: colors.muted,
    fontFamily: fonts.sansSemiBold,
  },
  reprofileDescription: {
    ...typ.caption,
    color: colors.muted,
    marginTop: spacing.hairline,
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
  privacyLabel: {
    ...typ.body,
    fontFamily: fonts.sansSemiBold,
    flex: 1,
    marginRight: spacing.column,
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
