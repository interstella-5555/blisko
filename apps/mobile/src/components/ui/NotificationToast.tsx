import { Pressable, StyleSheet, Text, View } from "react-native";
import { toast } from "sonner-native";
import { colors, fonts, spacing } from "../../theme";
import { Avatar } from "./Avatar";

interface NotificationToastProps {
  toastId: string | number;
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  avatarName: string;
  onPress: () => void;
}

export function NotificationToast({
  toastId,
  title,
  subtitle,
  avatarUrl,
  avatarName,
  onPress,
}: NotificationToastProps) {
  return (
    <Pressable
      onPress={() => {
        onPress();
        toast.dismiss(toastId);
      }}
      style={styles.container}
    >
      <Avatar uri={avatarUrl} name={avatarName} size={36} />
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.rule,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: spacing.column,
    paddingVertical: spacing.gutter,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
});
