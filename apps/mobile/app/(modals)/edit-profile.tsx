import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import { useAuthStore } from '../../src/stores/authStore';
import { authClient } from '../../src/lib/auth';
import { trpc } from '../../src/lib/trpc';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';

function FacebookIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function LinkedInIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z" stroke={colors.ink} strokeWidth={1.8} />
      <Path d="M2 9h4v12H2z" stroke={colors.ink} strokeWidth={1.8} />
      <Path d="M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke={colors.ink} strokeWidth={1.8} />
    </Svg>
  );
}

const providerConfig = {
  facebook: { label: 'Facebook', Icon: FacebookIcon },
  linkedin: { label: 'LinkedIn', Icon: LinkedInIcon },
} as const;

function ConnectedAccountRow({
  provider,
  username,
  onConnect,
  onDisconnect,
  disconnecting,
}: {
  provider: 'facebook' | 'linkedin';
  username: string | null | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const { label, Icon } = providerConfig[provider];
  const connected = !!username;

  return (
    <View style={styles.accountRow}>
      <Icon />
      {connected ? (
        <>
          <Text style={styles.accountHandle}>@{username}</Text>
          <Pressable onPress={onDisconnect} disabled={disconnecting}>
            <Text style={styles.disconnectText}>Odłącz</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.connectButton} onPress={onConnect}>
          <Text style={styles.connectText}>Połącz {label}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function EditProfileScreen() {
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [lookingFor, setLookingFor] = useState(profile?.lookingFor || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || null);
  const [uploading, setUploading] = useState(false);

  const utils = trpc.useUtils();
  const connectedAccounts = trpc.accounts.listConnected.useQuery();
  const disconnectAccount = trpc.accounts.disconnect.useMutation({
    onSuccess: () => {
      connectedAccounts.refetch();
    },
  });
  const updateProfile = trpc.profiles.update.useMutation({
    onSuccess: (data) => {
      if (data) setProfile(data);
      utils.profiles.me.invalidate();
      router.back();
    },
    onError: () => {
      Alert.alert('Blad', 'Nie udalo sie zapisac profilu');
    },
  });

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled || !result.assets?.[0]) return;

      setUploading(true);
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as any);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/uploads`, {
        method: 'POST',
        body: formData,
        headers: {
          authorization: `Bearer ${useAuthStore.getState().session?.token || ''}`,
        },
      });

      if (!response.ok) throw new Error('Upload failed');
      const { url } = await response.json();
      setAvatarUrl(url);
    } catch (error) {
      Alert.alert('Blad', 'Nie udalo sie przeslac zdjecia');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (displayName.trim().length < 2) {
      Alert.alert('Blad', 'Imie musi miec co najmniej 2 znaki');
      return;
    }
    if (bio.trim().length < 10) {
      Alert.alert('Blad', 'Bio musi miec co najmniej 10 znakow');
      return;
    }
    if (lookingFor.trim().length < 10) {
      Alert.alert('Blad', '"Kogo szukam" musi miec co najmniej 10 znakow');
      return;
    }

    updateProfile.mutate({
      displayName: displayName.trim(),
      bio: bio.trim(),
      lookingFor: lookingFor.trim(),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || undefined } : {}),
    });
  };

  const canSave =
    displayName.trim().length >= 2 &&
    bio.trim().length >= 10 &&
    lookingFor.trim().length >= 10;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickAvatar} disabled={uploading}>
            <Avatar
              uri={avatarUrl}
              name={displayName || '?'}
              size={100}
            />
          </Pressable>
          <Pressable onPress={handlePickAvatar} disabled={uploading}>
            <Text style={styles.changePhotoText}>
              {uploading ? 'Przesylanie...' : 'Zmien zdjecie'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Imie</Text>
          <TextInput
            testID="edit-name-input"
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Twoje imie"
            placeholderTextColor={colors.muted}
            spellCheck={false}
            autoCorrect={false}
            maxLength={50}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>O mnie</Text>
          <TextInput
            testID="edit-bio-input"
            style={[styles.input, styles.multilineInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Napisz kilka slow o sobie..."
            placeholderTextColor={colors.muted}
            spellCheck={false}
            autoCorrect={false}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{bio.length} / 500</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Kogo szukam</Text>
          <TextInput
            testID="edit-looking-for-input"
            style={[styles.input, styles.multilineInput]}
            value={lookingFor}
            onChangeText={setLookingFor}
            placeholder="Opisz, jakie osoby chcialbys poznac..."
            placeholderTextColor={colors.muted}
            spellCheck={false}
            autoCorrect={false}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{lookingFor.length} / 500</Text>
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>POŁĄCZONE KONTA</Text>

        {connectedAccounts.isLoading ? (
          <ActivityIndicator color={colors.muted} style={{ marginVertical: spacing.gutter }} />
        ) : (
          <>
            <ConnectedAccountRow
              provider="facebook"
              username={connectedAccounts.data?.find((a) => a.providerId === 'facebook')?.username}
              onConnect={() => authClient.signIn.social({ provider: 'facebook', callbackURL: '/(modals)/edit-profile' })}
              onDisconnect={() => disconnectAccount.mutate({ providerId: 'facebook' })}
              disconnecting={disconnectAccount.isPending}
            />
            <ConnectedAccountRow
              provider="linkedin"
              username={connectedAccounts.data?.find((a) => a.providerId === 'linkedin')?.username}
              onConnect={() => authClient.signIn.social({ provider: 'linkedin', callbackURL: '/(modals)/edit-profile' })}
              onDisconnect={() => disconnectAccount.mutate({ providerId: 'linkedin' })}
              disconnecting={disconnectAccount.isPending}
            />
          </>
        )}

        <View style={styles.saveContainer}>
          <Button
            testID="save-profile-btn"
            title="Zapisz"
            variant="accent"
            onPress={handleSave}
            disabled={!canSave}
            loading={updateProfile.isPending}
          />
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelText}>Anuluj</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.section,
    paddingBottom: 60,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.block,
  },
  changePhotoText: {
    ...typ.caption,
    color: colors.accent,
    marginTop: spacing.tight,
  },
  field: {
    marginBottom: spacing.section,
  },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  multilineInput: {},
  charCount: {
    ...typ.caption,
    textAlign: 'right',
    marginTop: spacing.hairline,
  },
  divider: {
    height: 1,
    backgroundColor: colors.rule,
    marginVertical: spacing.section,
  },
  sectionLabel: {
    ...typ.label,
    marginBottom: spacing.gutter,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gutter,
    marginBottom: spacing.gutter,
  },
  accountHandle: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  connectButton: {
    flex: 1,
  },
  connectText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  disconnectText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  saveContainer: {
    marginTop: spacing.column,
  },
  cancelButton: {
    alignItems: 'center',
    marginTop: spacing.column,
  },
  cancelText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
  },
});
