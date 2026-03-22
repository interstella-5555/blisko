import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../theme";

interface StatusBadgeProps {
  status: "pending" | "accepted" | "declined";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
      <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const statusConfig = {
  pending: {
    label: "OCZEKUJE",
    text: colors.status.warning.text,
    bg: colors.status.warning.bg,
  },
  accepted: {
    label: "ZAAKCEPTOWANE",
    text: colors.status.success.text,
    bg: colors.status.success.bg,
  },
  declined: {
    label: "NIEDOSTĘPNA",
    text: colors.muted,
    bg: colors.rule,
  },
};

interface CounterBadgeProps {
  count: number;
  type?: "received" | "sent";
}

export function CounterBadge({ count, type = "received" }: CounterBadgeProps) {
  if (count <= 0) return null;

  return (
    <View style={[styles.counterBadge, type === "sent" && styles.counterBadgeSent]}>
      <Text style={styles.counterText}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  counterBadge: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  counterBadgeSent: {
    backgroundColor: colors.muted,
  },
  counterText: {
    fontFamily: fonts.sansSemiBold,
    color: "#FFFFFF",
    fontSize: 11,
  },
});
