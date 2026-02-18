import { useState, useMemo } from 'react';
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
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { trpc } from '../../src/lib/trpc';
import { colors, type as typ, spacing, fonts } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { Avatar } from '../../src/components/ui/Avatar';
import { useConversationsStore } from '../../src/stores/conversationsStore';

export default function CreateGroupScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDiscoverable, setIsDiscoverable] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Get DM contacts from conversations store
  const conversations = useConversationsStore((s) => s.conversations);
  const dmContacts = useMemo(
    () =>
      conversations
        .filter((c) => c.type === 'dm' && c.participant)
        .map((c) => c.participant!),
    [conversations],
  );

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: (data) => {
      // Add the new group to conversations store
      useConversationsStore.getState().addNew({
        id: data.id,
        type: 'group',
        participant: null,
        groupName: data.name,
        groupAvatarUrl: data.avatarUrl,
        memberCount: 1 + selectedUserIds.size,
        lastMessage: null,
        unreadCount: 0,
        createdAt: String(data.createdAt),
        updatedAt: String(data.updatedAt),
      });
      router.replace(`/(modals)/chat/${data.id}`);
    },
    onError: () => {
      Alert.alert('Blad', 'Nie udalo sie utworzyc grupy');
    },
  });

  const handleCreate = () => {
    if (name.trim().length < 1) {
      Alert.alert('Blad', 'Podaj nazwe grupy');
      return;
    }
    createGroup.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      isDiscoverable,
      memberUserIds: [...selectedUserIds],
    });
  };

  const toggleMember = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const canCreate = name.trim().length >= 1;

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
        <View style={styles.field}>
          <Text style={styles.label}>Nazwa grupy</Text>
          <TextInput
            testID="group-name-input"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="np. Sąsiedzi z Mokotowa"
            placeholderTextColor={colors.muted}
            maxLength={100}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Opis</Text>
          <TextInput
            testID="group-description-input"
            style={[styles.input, styles.multilineInput]}
            value={description}
            onChangeText={setDescription}
            placeholder="O czym jest ta grupa? (opcjonalnie)"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={500}
          />
          {description.length > 0 && (
            <Text style={styles.charCount}>{description.length} / 500</Text>
          )}
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Widoczna w okolicy</Text>
          <Switch
            value={isDiscoverable}
            onValueChange={setIsDiscoverable}
            trackColor={{ false: colors.rule, true: colors.accent }}
            thumbColor={colors.bg}
          />
        </View>
        <Text style={styles.toggleDescription}>
          Osoby w poblizu beda mogly znalezc i dolaczyc do grupy
        </Text>

        {dmContacts.length > 0 && (
          <View style={styles.membersSection}>
            <Text style={styles.label}>Dodaj czlonkow</Text>
            {dmContacts.map((contact) => (
              <Pressable
                key={contact.userId}
                style={styles.contactRow}
                onPress={() => toggleMember(contact.userId)}
              >
                <Avatar
                  uri={contact.avatarUrl}
                  name={contact.displayName}
                  size={36}
                />
                <Text style={styles.contactName} numberOfLines={1}>
                  {contact.displayName}
                </Text>
                <View
                  style={[
                    styles.checkbox,
                    selectedUserIds.has(contact.userId) && styles.checkboxChecked,
                  ]}
                >
                  {selectedUserIds.has(contact.userId) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.submitContainer}>
          <Button
            testID="create-group-btn"
            title="Utworz grupe"
            variant="fullWidth"
            onPress={handleCreate}
            disabled={!canCreate}
            loading={createGroup.isPending}
          />
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.hairline,
  },
  toggleLabel: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  toggleDescription: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.section,
  },
  membersSection: {
    marginBottom: spacing.section,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.compact,
    gap: spacing.gutter,
  },
  contactName: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  checkmark: {
    color: colors.bg,
    fontSize: 12,
    fontFamily: fonts.sansMedium,
  },
  submitContainer: {
    marginTop: spacing.column,
  },
});
