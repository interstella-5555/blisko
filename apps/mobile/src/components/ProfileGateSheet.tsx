import { router } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing } from "../theme";

interface ProfileGateSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export function ProfileGateSheet({ visible, onDismiss }: ProfileGateSheetProps) {
  const handleComplete = () => {
    onDismiss();
    router.push("/onboarding");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Uzupelnij profil</Text>
          <Text style={styles.body}>Zeby korzystac z tej funkcji, uzupelnij swoj profil.</Text>
          <Pressable style={styles.cta} onPress={handleComplete}>
            <Text style={styles.ctaText}>Uzupelnij teraz</Text>
          </Pressable>
          <Pressable style={styles.dismiss} onPress={onDismiss}>
            <Text style={styles.dismissText}>Pozniej</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.section,
    paddingBottom: 40,
    alignItems: "center",
  },
  handle: {
    width: 32,
    height: 3,
    backgroundColor: colors.rule,
    borderRadius: 1.5,
    marginTop: spacing.gutter,
    marginBottom: spacing.section,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    marginBottom: spacing.gutter,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.section,
  },
  cta: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: spacing.block,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: spacing.gutter,
  },
  ctaText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.bg,
  },
  dismiss: {
    paddingVertical: spacing.compact,
  },
  dismissText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.muted,
  },
});
