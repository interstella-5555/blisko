import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { colors, fonts, spacing, type as typ } from "../../src/theme";

interface ToggleRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

function ToggleRow({ label, value, onValueChange }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.rule, true: colors.ink }}
        thumbColor="white"
      />
    </View>
  );
}

export default function NotificationsScreen() {
  const [newWaves, setNewWaves] = useState(true);
  const [waveResponses, setWaveResponses] = useState(true);
  const [newMessages, setNewMessages] = useState(true);
  const [groupInvites, setGroupInvites] = useState(true);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PUSH</Text>

        <ToggleRow label="Nowe pingi" value={newWaves} onValueChange={setNewWaves} />
        <ToggleRow label="Odpowiedzi na pingi" value={waveResponses} onValueChange={setWaveResponses} />
        <ToggleRow label="Nowe wiadomosci" value={newMessages} onValueChange={setNewMessages} />
        <ToggleRow label="Zaproszenia do grup" value={groupInvites} onValueChange={setGroupInvites} />

        <Text style={styles.helperText}>
          Powiadomienia push wymagaja zgody systemowej. Jesli je wylaczyles, wlacz je w Ustawieniach iPhone'a {">"}{" "}
          Blisko.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  section: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.column,
  },
  sectionLabel: {
    ...typ.label,
    marginBottom: spacing.gutter,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.column,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  toggleLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
    marginRight: spacing.column,
  },
  helperText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: spacing.column,
  },
});
