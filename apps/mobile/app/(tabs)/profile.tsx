import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Avatar } from '../../src/components/ui/Avatar';
import { IconSparkles } from '../../src/components/ui/icons';

function formatTimeLeft(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '∞';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'wygasł';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function hasActiveStatus(profile: { currentStatus?: string | null; statusExpiresAt?: string | null } | null): boolean {
  if (!profile?.currentStatus) return false;
  if (!profile.statusExpiresAt) return true;
  return new Date(profile.statusExpiresAt).getTime() > Date.now();
}

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const activeStatus = hasActiveStatus(profile);

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

        {activeStatus ? (
          <Pressable
            style={styles.statusPill}
            onPress={() =>
              router.push({
                pathname: '/settings/set-status' as any,
                params: { prefill: profile!.currentStatus! },
              })
            }
          >
            <Text style={styles.statusText} numberOfLines={2}>
              {profile!.currentStatus}
            </Text>
            <Text style={styles.statusExpiry}>
              wygasa za {formatTimeLeft(profile!.statusExpiresAt)}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.setStatusButton}
            onPress={() => router.push('/settings/set-status' as any)}
          >
            <Text style={styles.setStatusText}>+ Ustaw status na teraz</Text>
          </Pressable>
        )}
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
        onPress={() => router.push('/settings/profiling' as any)}
      >
        <View style={styles.reprofileRow}>
          <IconSparkles size={16} color={colors.muted} />
          <Text style={styles.reprofileTitle}>Wyprobuj automatyczne profilowanie</Text>
        </View>
        <Text style={styles.reprofileDescription}>
          Odpowiedz na kilka pytan — na ich podstawie wygenerujemy nowy opis, sekcje "kogo szukam" i portret osobowosci. Przed zapisaniem mozesz wszystko przejrzec i edytowac.
        </Text>
      </Pressable>

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
  setStatusButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.rule,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  setStatusText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  statusPill: {
    backgroundColor: '#FDF5EC',
    borderWidth: 1.5,
    borderColor: '#E8C9A0',
    borderRadius: 14,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    maxWidth: 260,
    alignSelf: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
  },
  statusExpiry: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    color: '#D4851C',
    marginTop: 4,
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
});
