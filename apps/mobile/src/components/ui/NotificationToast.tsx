import { Pressable, StyleSheet, Text, View } from "react-native";
import { toast } from "sonner-native";
import { useIsGhost } from "@/hooks/useIsGhost";
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
  const isGhost = useIsGhost();

  return (
    <Pressable
      onPress={() => {
        onPress();
        toast.dismiss(toastId);
      }}
      style={styles.container}
    >
      <Avatar uri={avatarUrl} name={avatarName} size={36} blurred={isGhost} />
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
    borderRadius: 14,
    padding: 14,
    alignSelf: "stretch",
    marginHorizontal: spacing.section,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
});
