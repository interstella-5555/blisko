import { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../../theme';
import { IconCamera, IconPin } from '../ui/icons';

interface ReplyingTo {
  id: string;
  content: string;
  senderName: string;
}

interface ChatInputProps {
  onSend: (text: string, replyToId?: string) => void;
  onSendImage?: () => void;
  onSendLocation?: () => void;
  replyingTo?: ReplyingTo | null;
  onCancelReply?: () => void;
  onTyping?: () => void;
}

export function ChatInput({
  onSend,
  onSendImage,
  onSendLocation,
  replyingTo,
  onCancelReply,
  onTyping,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { bottom } = useSafeAreaInsets();

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, replyingTo?.id);
    setText('');
    onCancelReply?.();
  };

  const handleChangeText = (value: string) => {
    setText(value);
    onTyping?.();
  };

  return (
    <View style={[styles.container, { paddingBottom: bottom }]}>
      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyContent}>
            <Text style={styles.replyLabel}>Odpowiadasz:</Text>
            <Text style={styles.replyText} numberOfLines={1}>{replyingTo.content}</Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8} testID="chat-reply-close">
            <Text style={styles.replyClose}>✕</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.inputRow}>
        <Pressable style={styles.mediaBtn} onPress={onSendImage} hitSlop={4} testID="chat-photo-btn">
          <IconCamera size={20} color={colors.muted} />
        </Pressable>
        <Pressable style={styles.mediaBtn} onPress={onSendLocation} hitSlop={4} testID="chat-location-btn">
          <IconPin size={20} color={colors.muted} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          placeholder="Wpisz wiadomość..."
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
          testID="chat-input"
          // @ts-expect-error -- maxNumberOfLines works on RN but isn't typed everywhere
          maxNumberOfLines={4}
        />
        <Pressable
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim()}
          testID="chat-send-btn"
        >
          <Text style={[styles.sendText, !text.trim() && styles.sendTextDisabled]}>Wyślij</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    backgroundColor: colors.bg,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.section,
    paddingVertical: spacing.tight,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    backgroundColor: 'rgba(213, 208, 196, 0.15)',
  },
  replyContent: {
    flex: 1,
    marginRight: spacing.tight,
  },
  replyLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  replyText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginTop: 1,
  },
  replyClose: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.muted,
    padding: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.tight,
    gap: spacing.tick,
  },
  mediaBtn: {
    paddingVertical: spacing.tight,
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    maxHeight: 100,
    paddingVertical: spacing.tight,
    paddingHorizontal: spacing.gutter,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 20,
    backgroundColor: colors.bg,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.column,
    paddingVertical: spacing.compact,
    borderRadius: 16,
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
  sendText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#FFFFFF',
  },
  sendTextDisabled: {
    color: '#FFFFFF',
  },
});
