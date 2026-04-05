import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { colors, spacing, type as typ } from "@/theme";

interface NinjaSkipModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function NinjaSkipModal({ visible, onConfirm, onCancel }: NinjaSkipModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.emoji}>🥷</Text>
          <Text style={styles.title}>Przejść na Ninja?</Text>
          <Text style={styles.body}>
            Bez widoczności na mapie i bez możliwości pingowania. Możesz wrócić do uzupełniania profilu w każdej chwili
            w ustawieniach.
          </Text>
          <View style={styles.buttons}>
            <Button title="Przejdź na Ninja" variant="accent" onPress={onConfirm} />
            <Pressable onPress={onCancel} hitSlop={8} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Jednak wypełnię</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.section,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: spacing.section,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  emoji: {
    fontSize: 40,
    marginBottom: spacing.column,
  },
  title: {
    ...typ.heading,
    textAlign: "center",
    marginBottom: spacing.tight,
  },
  body: {
    ...typ.body,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.section,
  },
  buttons: {
    width: "100%",
    gap: spacing.column,
    alignItems: "center",
  },
  cancelButton: {
    paddingVertical: spacing.tight,
  },
  cancelText: {
    ...typ.caption,
    color: colors.muted,
  },
});
