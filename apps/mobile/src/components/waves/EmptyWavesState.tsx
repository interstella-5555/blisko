import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, type as typ } from "../../theme";
import { IconSend, IconWave } from "../ui/icons";

interface EmptyWavesStateProps {
  type: "received" | "sent";
}

export function EmptyWavesState({ type }: EmptyWavesStateProps) {
  const isReceived = type === "received";

  return (
    <View testID={isReceived ? "waves-empty-received" : "waves-empty-sent"} style={styles.container}>
      {isReceived ? <IconWave size={48} color={colors.muted} /> : <IconSend size={48} color={colors.muted} />}
      <Text style={styles.title}>{isReceived ? "Brak zaczepień" : "Brak wysłanych zaczepień"}</Text>
      <Text style={styles.text}>
        {isReceived ? "Gdy ktoś Cię zaczepi, zobaczysz to tutaj" : 'Zaczep kogoś w zakładce "W okolicy"'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 100,
    paddingHorizontal: spacing.section,
  },
  title: {
    ...typ.heading,
    marginTop: spacing.column,
    marginBottom: spacing.tight,
  },
  text: {
    ...typ.body,
    color: colors.muted,
    textAlign: "center",
  },
});
