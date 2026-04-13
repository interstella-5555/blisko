import { forwardRef } from "react";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useIsGhost } from "@/hooks/useIsGhost";
import { colors, fonts, spacing } from "../../theme";
import { Avatar } from "../ui/Avatar";

export type BubblePosition = "solo" | "first" | "mid" | "last";

export interface MessageBubbleProps {
  content: string;
  type?: "text" | "image" | "location";
  metadata?: Record<string, unknown> | null;
  isMine: boolean;
  createdAt: string;
  readAt: string | null;
  deletedAt?: string | null;
  replyTo?: {
    content: string;
    senderName: string;
  } | null;
  reactions?: { emoji: string; count: number; myReaction: boolean }[];
  position?: BubblePosition;
  showAvatar?: boolean;
  avatarUrl?: string;
  senderName?: string;
  showAvatarColumn?: boolean;
  timestamp?: string | null;
  receipt?: "sent" | "read" | null;
  hidden?: boolean;
  onLongPress?: () => void;
  onReactionPress?: (emoji: string) => void;
  onReplyPress?: () => void;
}

const RADIUS = 16;
const RADIUS_SMALL = 4;

const mineRadii: Record<BubblePosition, ViewStyle> = {
  solo: { borderRadius: RADIUS },
  first: {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    borderBottomRightRadius: RADIUS_SMALL,
    borderBottomLeftRadius: RADIUS,
  },
  mid: {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS_SMALL,
    borderBottomRightRadius: RADIUS_SMALL,
    borderBottomLeftRadius: RADIUS,
  },
  last: {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS_SMALL,
    borderBottomRightRadius: RADIUS,
    borderBottomLeftRadius: RADIUS,
  },
};

const theirsRadii: Record<BubblePosition, ViewStyle> = {
  solo: { borderRadius: RADIUS },
  first: {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
    borderBottomLeftRadius: RADIUS_SMALL,
  },
  mid: {
    borderTopLeftRadius: RADIUS_SMALL,
    borderTopRightRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
    borderBottomLeftRadius: RADIUS_SMALL,
  },
  last: {
    borderTopLeftRadius: RADIUS_SMALL,
    borderTopRightRadius: RADIUS,
    borderBottomRightRadius: RADIUS,
    borderBottomLeftRadius: RADIUS,
  },
};

export const MessageBubble = forwardRef<View, MessageBubbleProps>(function MessageBubble(
  {
    content,
    type = "text",
    metadata,
    isMine,
    deletedAt,
    replyTo,
    reactions,
    position = "solo",
    showAvatar,
    avatarUrl,
    senderName,
    showAvatarColumn = true,
    timestamp,
    receipt,
    hidden,
    onLongPress,
    onReactionPress,
  },
  ref,
) {
  const isGhost = useIsGhost();

  if (deletedAt) {
    return (
      <View style={[styles.bubble, styles.bubbleDeleted]} testID="message-deleted">
        <Text style={styles.deletedText}>Wiadomość usunięta</Text>
      </View>
    );
  }

  const radiusStyle = isMine ? mineRadii[position] : theirsRadii[position];

  const bubbleContent = (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs, radiusStyle]}
    >
      {replyTo && (
        <View style={styles.replyBar}>
          <Text style={styles.replySender} numberOfLines={1}>
            {replyTo.senderName}
          </Text>
          <Text style={styles.replyContent} numberOfLines={1}>
            {replyTo.content}
          </Text>
        </View>
      )}
      {type === "image" && metadata ? (
        <Image source={{ uri: metadata.imageUrl as string }} style={styles.imageContent} resizeMode="cover" />
      ) : type === "location" && metadata ? (
        <Pressable
          style={styles.locationContent}
          onPress={() => {
            const url =
              Platform.OS === "ios"
                ? `maps:0,0?q=${metadata.latitude},${metadata.longitude}`
                : `geo:${metadata.latitude},${metadata.longitude}`;
            Linking.openURL(url);
          }}
        >
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={[styles.locationLabel, isMine ? styles.contentMine : styles.contentTheirs]}>
            Udostępniona lokalizacja
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.content, isMine ? styles.contentMine : styles.contentTheirs]}>{content}</Text>
      )}
      {timestamp && (
        <View style={styles.timestampRow}>
          <Text style={[styles.timestampText, isMine ? styles.timestampMine : styles.timestampTheirs]}>
            {timestamp}
          </Text>
          {receipt && (
            <Text style={[styles.receiptMark, receipt === "read" ? styles.receiptRead : styles.receiptSent]}>
              {receipt === "read" ? "✓✓" : "✓"}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );

  return (
    <View
      ref={ref}
      style={[styles.wrapper, isMine ? styles.wrapperMine : styles.wrapperTheirs, hidden && styles.hidden]}
      testID="message-bubble"
    >
      {!isMine && showAvatarColumn ? (
        <View style={styles.messageRow}>
          {showAvatar ? (
            <Avatar uri={avatarUrl} name={senderName || "?"} size={28} blurred={isGhost} />
          ) : (
            <View style={styles.avatarSpacer} />
          )}
          <View style={styles.bubbleCol}>{bubbleContent}</View>
        </View>
      ) : (
        bubbleContent
      )}
      {reactions && reactions.length > 0 && (
        <View
          style={[
            styles.reactions,
            isMine ? styles.reactionsMine : styles.reactionsTheirs,
            !isMine && !showAvatarColumn && { marginLeft: 0 },
          ]}
        >
          {reactions.map((r) => (
            <Pressable
              key={r.emoji}
              style={[styles.reactionChip, r.myReaction && styles.reactionChipActive]}
              onPress={() => onReactionPress?.(r.emoji)}
            >
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 1,
    maxWidth: "80%",
  },
  wrapperMine: {
    alignSelf: "flex-end",
  },
  wrapperTheirs: {
    alignSelf: "flex-start",
  },
  hidden: {
    opacity: 0,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  avatarSpacer: {
    width: 28,
  },
  bubbleCol: {
    flexShrink: 1,
  },
  bubble: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.tight,
    borderRadius: RADIUS,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
  },
  bubbleTheirs: {
    backgroundColor: colors.mapBg,
  },
  bubbleDeleted: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.rule,
    borderStyle: "dashed",
    alignSelf: "center",
    maxWidth: "80%",
    marginVertical: 2,
  },
  deletedText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    fontStyle: "italic",
    color: colors.muted,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.tight,
  },
  replyBar: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.tight,
    marginBottom: spacing.tick,
    opacity: 0.7,
    borderRadius: 4,
  },
  replySender: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.accent,
  },
  replyContent: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  imageContent: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
  },
  locationContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.tight,
    paddingVertical: 4,
  },
  locationIcon: {
    fontSize: 24,
  },
  locationLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  content: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
  },
  contentMine: {
    color: colors.bg,
  },
  contentTheirs: {
    color: colors.ink,
  },
  timestampRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  timestampText: {
    fontFamily: fonts.sans,
    fontSize: 10,
  },
  timestampMine: {
    color: colors.bg,
    opacity: 0.7,
  },
  timestampTheirs: {
    color: colors.muted,
  },
  receiptMark: {
    fontSize: 10,
    fontFamily: fonts.sans,
  },
  receiptRead: {
    color: colors.bg,
    opacity: 0.9,
  },
  receiptSent: {
    color: colors.bg,
    opacity: 0.5,
  },
  reactions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: -4,
    marginBottom: 4,
  },
  reactionsMine: {
    justifyContent: "flex-end",
  },
  reactionsTheirs: {
    justifyContent: "flex-start",
    marginLeft: 34,
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 2,
  },
  reactionChipActive: {
    backgroundColor: "rgba(192, 57, 43, 0.08)",
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.muted,
  },
});
