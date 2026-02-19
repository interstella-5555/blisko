import { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageBubble, type MessageBubbleProps } from './MessageBubble';
import { IconReply, IconCopy, IconTrash } from '../ui/icons';
import { colors, fonts, spacing } from '../../theme';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Space needed for reaction bar + action menu + padding
const REACTION_BAR_HEIGHT = 52;
const ACTION_MENU_HEIGHT = 170; // approximate
const VERTICAL_PAD = 12;

interface ContextMenuData {
  messageId: string;
  isMine: boolean;
  layout: { x: number; y: number; width: number; height: number };
  bubbleProps: Omit<MessageBubbleProps, 'onLongPress' | 'onReactionPress' | 'hidden'>;
}

interface MessageContextMenuProps {
  data: ContextMenuData;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function MessageContextMenu({
  data,
  onReact,
  onReply,
  onCopy,
  onDelete,
  onClose,
}: MessageContextMenuProps) {
  const insets = useSafeAreaInsets();
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const messageScale = useRef(new Animated.Value(0.97)).current;
  const reactionAnim = useRef(new Animated.Value(0)).current;
  const actionAnim = useRef(new Animated.Value(0)).current;

  // Determine if there's enough space above the message for reactions
  const safeTop = insets.top + 8;
  const safeBottom = SCREEN_HEIGHT - insets.bottom - 8;
  const spaceAbove = data.layout.y - safeTop;
  const spaceBelow = safeBottom - (data.layout.y + data.layout.height);

  // If not enough space above for reactions, flip them below the message
  const reactionsAbove = spaceAbove >= REACTION_BAR_HEIGHT + VERTICAL_PAD;

  // Calculate where to position the message clone so everything fits
  let messageTop = data.layout.y;

  if (reactionsAbove) {
    // Need space above for reactions and below for action menu
    const neededAbove = REACTION_BAR_HEIGHT + VERTICAL_PAD;
    const neededBelow = ACTION_MENU_HEIGHT + VERTICAL_PAD;

    if (spaceAbove < neededAbove) {
      messageTop = safeTop + neededAbove;
    }
    if (safeBottom - (messageTop + data.layout.height) < neededBelow) {
      messageTop = safeBottom - data.layout.height - neededBelow;
    }
  } else {
    // Reactions below message, action menu below reactions
    const neededBelow = REACTION_BAR_HEIGHT + ACTION_MENU_HEIGHT + VERTICAL_PAD * 2;
    if (spaceBelow < neededBelow) {
      messageTop = safeBottom - data.layout.height - neededBelow;
    }
    if (messageTop < safeTop) {
      messageTop = safeTop;
    }
  }

  // Reaction bar position
  const reactionTop = reactionsAbove
    ? messageTop - REACTION_BAR_HEIGHT - VERTICAL_PAD
    : messageTop + data.layout.height + VERTICAL_PAD;

  // Action menu position
  const actionTop = reactionsAbove
    ? messageTop + data.layout.height + VERTICAL_PAD
    : reactionTop + REACTION_BAR_HEIGHT + VERTICAL_PAD;

  useEffect(() => {
    // Phase 1: backdrop + message
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(messageScale, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Phase 2: staggered reaction bar + action menu
      Animated.stagger(50, [
        Animated.spring(reactionAnim, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.spring(actionAnim, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, []);

  const dismiss = useCallback(
    (callback?: () => void) => {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(reactionAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(actionAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(messageScale, {
          toValue: 0.97,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        callback?.();
        onClose();
      });
    },
    [backdropAnim, reactionAnim, actionAnim, messageScale, onClose]
  );

  const handleReact = useCallback(
    (emoji: string) => dismiss(() => onReact(emoji)),
    [dismiss, onReact]
  );

  const handleReply = useCallback(() => dismiss(onReply), [dismiss, onReply]);
  const handleCopy = useCallback(() => dismiss(onCopy), [dismiss, onCopy]);
  const handleDelete = useCallback(() => dismiss(onDelete), [dismiss, onDelete]);

  const reactionSlide = reactionsAbove ? -12 : 12;
  const actionSlide = 12;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropAnim }]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 0}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.dimLayer} />
        </Animated.View>
      </Pressable>

      {/* Floating message clone */}
      <Animated.View
        style={[
          styles.floatingMessage,
          {
            top: messageTop,
            left: data.layout.x,
            width: data.layout.width,
            transform: [{ scale: messageScale }],
          },
        ]}
        pointerEvents="none"
      >
        <MessageBubble {...data.bubbleProps} onLongPress={undefined} onReactionPress={undefined} />
      </Animated.View>

      {/* Reaction bar */}
      <Animated.View
        style={[
          styles.reactionBar,
          data.isMine ? styles.reactionBarMine : styles.reactionBarTheirs,
          {
            top: reactionTop,
            opacity: reactionAnim,
            transform: [
              {
                translateY: reactionAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [reactionSlide, 0],
                }),
              },
            ],
          },
        ]}
      >
        {REACTIONS.map((emoji) => (
          <Pressable
            key={emoji}
            style={({ pressed }) => [styles.reactionBtn, pressed && styles.reactionBtnPressed]}
            onPress={() => handleReact(emoji)}
            testID={`reaction-${emoji}`}
          >
            <Text style={styles.reactionEmoji}>{emoji}</Text>
          </Pressable>
        ))}
      </Animated.View>

      {/* Action menu */}
      <Animated.View
        style={[
          styles.actionMenu,
          data.isMine ? styles.actionMenuMine : styles.actionMenuTheirs,
          {
            top: actionTop,
            opacity: actionAnim,
            transform: [
              {
                translateY: actionAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [actionSlide, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
          onPress={handleReply}
        >
          <IconReply size={18} color={colors.ink} />
          <Text style={styles.actionLabel}>Odpowiedz</Text>
        </Pressable>

        <View style={styles.actionSeparator} />

        {data.bubbleProps.type !== 'location' && (
          <>
            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
              onPress={handleCopy}
            >
              <IconCopy size={18} color={colors.ink} />
              <Text style={styles.actionLabel}>Kopiuj</Text>
            </Pressable>
            <View style={styles.actionSeparator} />
          </>
        )}

        {data.isMine && (
          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            onPress={handleDelete}
          >
            <IconTrash size={18} color={colors.accent} />
            <Text style={[styles.actionLabel, styles.actionLabelDestructive]}>Usuń</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

export type { ContextMenuData };

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  dimLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 26, 0.15)',
  },
  floatingMessage: {
    position: 'absolute',
  },
  reactionBar: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  reactionBarMine: {
    right: spacing.section,
  },
  reactionBarTheirs: {
    left: spacing.section,
  },
  reactionBtn: {
    padding: 6,
    borderRadius: 20,
  },
  reactionBtnPressed: {
    backgroundColor: colors.mapBg,
    transform: [{ scale: 1.2 }],
  },
  reactionEmoji: {
    fontSize: 28,
  },
  actionMenu: {
    position: 'absolute',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 14,
    minWidth: 180,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  actionMenuMine: {
    right: spacing.section,
  },
  actionMenuTheirs: {
    left: spacing.section,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  actionRowPressed: {
    backgroundColor: colors.mapBg,
  },
  actionLabel: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  actionLabelDestructive: {
    color: colors.accent,
  },
  actionSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
    marginHorizontal: 16,
  },
});
