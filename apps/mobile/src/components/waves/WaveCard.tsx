import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing } from "../../theme";
import { Avatar } from "../ui/Avatar";
import { StatusBadge } from "../ui/Badge";
import { Button } from "../ui/Button";

interface WaveProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
}

interface Wave {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined";
  senderStatusSnapshot: string | null;
  createdAt: string;
}

interface WaveCardProps {
  wave: Wave;
  profile: WaveProfile;
  type: "received" | "sent";
  onAccept?: () => void;
  onDecline?: () => void;
  isAccepting?: boolean;
  isDeclining?: boolean;
}

export function WaveCard({
  wave,
  profile,
  type,
  onAccept,
  onDecline,
  isAccepting = false,
  isDeclining = false,
}: WaveCardProps) {
  const isReceived = type === "received";
  const isPending = wave.status === "pending";
  const isLoading = isAccepting || isDeclining;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "teraz";
    if (diffMins < 60) return `${diffMins} min temu`;
    if (diffHours < 24) return `${diffHours} godz. temu`;
    if (diffDays < 7) return `${diffDays} dni temu`;
    return date.toLocaleDateString("pl-PL");
  };

  return (
    <View testID={`wave-card-${wave.id}`} style={styles.card}>
      <View style={styles.header}>
        <Avatar uri={profile.avatarUrl} name={profile.displayName} size={44} />
        <View style={styles.info}>
          <Text style={styles.name}>{profile.displayName}</Text>
          <Text style={styles.time}>{formatTime(wave.createdAt)}</Text>
        </View>
        {!isReceived && <StatusBadge status={wave.status} />}
      </View>

      {profile.bio && (
        <Text style={styles.bio} numberOfLines={2}>
          {profile.bio}
        </Text>
      )}

      {isReceived && wave.senderStatusSnapshot && (
        <View style={styles.statusSnapshot}>
          <Text style={styles.statusSnapshotLabel}>SZUKA TERAZ</Text>
          <Text style={styles.statusSnapshotText} numberOfLines={2}>
            {wave.senderStatusSnapshot}
          </Text>
        </View>
      )}

      {isReceived && isPending && (
        <View style={styles.actions}>
          <Button
            testID={`wave-decline-${wave.id}`}
            title="Nie teraz"
            variant="ghost"
            onPress={onDecline!}
            disabled={isLoading}
            loading={isDeclining}
          />
          <Button
            testID={`wave-accept-${wave.id}`}
            title="Akceptuj"
            variant="accent"
            onPress={onAccept!}
            disabled={isLoading}
            loading={isAccepting}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.column,
    marginBottom: spacing.gutter,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.gutter,
  },
  info: {
    flex: 1,
    marginLeft: spacing.gutter,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.ink,
  },
  time: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  bio: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: spacing.gutter,
  },
  statusSnapshot: {
    backgroundColor: "#FFF8F0",
    borderLeftWidth: 2,
    borderLeftColor: "#D4851C",
    paddingVertical: spacing.tight,
    paddingHorizontal: spacing.gutter,
    marginBottom: spacing.gutter,
  },
  statusSnapshotLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: "#D4851C",
    marginBottom: 2,
  },
  statusSnapshotText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.gutter,
  },
});
