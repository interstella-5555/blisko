import { router, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import { Button } from "@/components/ui/Button";
import { colors, spacing, type as typ } from "@/theme";

interface BulletProps {
  title: string;
  body: string;
}

function Bullet({ title, body }: BulletProps) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletTitle}>{title}</Text>
      <Text style={styles.bulletText}>{body}</Text>
    </View>
  );
}

export default function QuestionsIntroScreen() {
  const handleStart = () => {
    router.push("/onboarding/questions");
  };

  return (
    <OnboardingScreen
      footer={<Button testID="questions-intro-start" title="Dalej" variant="accent" onPress={handleStart} />}
    >
      <Stack.Screen
        options={{
          header: () => <OnboardingStepHeader label="Krok 3" onBack={() => router.back()} />,
        }}
      />
      <Text style={styles.title}>Jak to działa</Text>

      <View style={styles.bullets}>
        <Bullet
          title="Kilka pytań"
          body="Zaczniemy od 7 krótkich pytań. Jeśli coś będzie wymagało doprecyzowania, dopytamy maksymalnie o 3 rzeczy."
        />
        <Bullet
          title="Zrobimy z tego profil"
          body="Na podstawie Twoich odpowiedzi przygotujemy bio i opis tego, kogo lub czego szukasz. Zobaczysz gotowy tekst i poprawisz, zanim pokażemy go innym."
        />
        <Bullet
          title="Nie musi być idealnie"
          body="Odpowiedzi nie muszą być pełnymi zdaniami. Mogą być krótkie, w punktach, nawet pojedyncze słowa — liczy się co napiszesz, nie jak. Pod każdym pytaniem zobaczysz kilka przykładowych odpowiedzi."
        />
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typ.display,
    marginBottom: spacing.section,
  },
  bullets: {
    gap: spacing.section,
  },
  bullet: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.column,
    gap: 4,
  },
  bulletTitle: {
    ...typ.heading,
  },
  bulletText: {
    ...typ.body,
    color: colors.muted,
    lineHeight: 22,
  },
});
