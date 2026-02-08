import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { colors, spacing } from '../../theme';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

interface ReactionPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ visible, onSelect, onClose }: ReactionPickerProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.picker}>
          {REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              style={styles.emojiBtn}
              testID={`reaction-${emoji}`}
              onPress={() => {
                onSelect(emoji);
                onClose();
              }}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  picker: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: spacing.tight,
    paddingVertical: spacing.tight,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  emojiBtn: {
    padding: spacing.tight,
  },
  emoji: {
    fontSize: 28,
  },
});
