import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Avatar } from "../../src/components/ui/Avatar";
import { Button } from "../../src/components/ui/Button";
import { trpc } from "../../src/lib/trpc";
import { useAuthStore } from "../../src/stores/authStore";
import { colors, fonts, spacing, type as typ } from "../../src/theme";

export default function EditProfileScreen() {
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);

  const [displayName, _setDisplayName] = useState(profile?.displayName || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [lookingFor, setLookingFor] = useState(profile?.lookingFor || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl || null);
  const [superpower, setSuperpower] = useState(profile?.superpower || "");
  const [offerType, setOfferType] = useState<"volunteer" | "exchange" | "gig" | "">(profile?.offerType || "");
  const [uploading, setUploading] = useState(false);

  const utils = trpc.useUtils();
  const updateProfile = trpc.profiles.update.useMutation({
    onSuccess: (data) => {
      if (data) setProfile(data);
      utils.profiles.me.invalidate();
      router.back();
    },
    onError: () => {
      Alert.alert("Blad", "Nie udalo sie zapisac profilu");
    },
  });

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled || !result.assets?.[0]) return;

      setUploading(true);
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.fileName || "avatar.jpg",
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(`${apiUrl}/uploads`, {
        method: "POST",
        body: formData,
        headers: {
          authorization: `Bearer ${useAuthStore.getState().session?.token || ""}`,
        },
      });

      if (!response.ok) throw new Error("Upload failed");
      const { url } = await response.json();
      setAvatarUrl(url);
    } catch (_error) {
      Alert.alert("Blad", "Nie udalo sie przeslac zdjecia");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (bio.trim().length < 10) {
      Alert.alert("Blad", "Bio musi miec co najmniej 10 znakow");
      return;
    }
    if (lookingFor.trim().length < 10) {
      Alert.alert("Blad", '"Kogo szukam" musi miec co najmniej 10 znakow');
      return;
    }

    updateProfile.mutate({
      bio: bio.trim(),
      lookingFor: lookingFor.trim(),
      ...(superpower.trim() ? { superpower: superpower.trim() } : {}),
      ...(offerType ? { offerType } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || undefined } : {}),
    });
  };

  const canSave = bio.trim().length >= 10 && lookingFor.trim().length >= 10;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickAvatar} disabled={uploading}>
            <Avatar uri={avatarUrl} name={displayName || "?"} size={100} />
          </Pressable>
          <Pressable onPress={handlePickAvatar} disabled={uploading}>
            <Text style={styles.changePhotoText}>{uploading ? "Przesylanie..." : "Zmien zdjecie"}</Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Imie</Text>
          <TextInput
            testID="edit-name-input"
            style={[styles.input, styles.inputLocked]}
            value={displayName}
            editable={false}
          />
          <Text style={styles.lockedHint}>Imię nie może być zmienione</Text>
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

        <View style={styles.field}>
          <Text style={styles.label}>Co mogę dać</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={superpower}
            onChangeText={setSuperpower}
            placeholder="W czym możesz komuś pomóc od ręki?"
            placeholderTextColor={colors.muted}
            spellCheck={false}
            autoCorrect={false}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={300}
          />
          <Text style={styles.charCount}>{superpower.length} / 300</Text>
        </View>

        {superpower.trim().length > 0 && (
          <View style={styles.field}>
            <Text style={styles.label}>Forma</Text>
            <View style={styles.offerTypeRow}>
              {(["volunteer", "exchange", "gig"] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.offerTypeChip, offerType === t && styles.offerTypeChipSelected]}
                  onPress={() => setOfferType(t)}
                >
                  <Text style={[styles.offerTypeText, offerType === t && styles.offerTypeTextSelected]}>
                    {{ volunteer: "Wolontariat", exchange: "Wymiana", gig: "Zlecenie" }[t]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
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
    alignItems: "center",
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
    textTransform: "uppercase",
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
  inputLocked: {
    color: colors.muted,
    borderBottomColor: colors.rule,
  },
  lockedHint: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  multilineInput: {},
  charCount: {
    ...typ.caption,
    textAlign: "right",
    marginTop: spacing.hairline,
  },
  offerTypeRow: {
    flexDirection: "row",
    gap: spacing.tight,
  },
  offerTypeChip: {
    borderWidth: 1.5,
    borderColor: colors.rule,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offerTypeChipSelected: {
    backgroundColor: "#D4851C",
    borderColor: "#D4851C",
  },
  offerTypeText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.ink,
  },
  offerTypeTextSelected: {
    color: "#FFFFFF",
  },
  saveContainer: {
    marginTop: spacing.column,
  },
  cancelButton: {
    alignItems: "center",
    marginTop: spacing.column,
  },
  cancelText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
  },
});
