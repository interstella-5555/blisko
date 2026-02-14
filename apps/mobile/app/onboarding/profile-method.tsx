import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, type as typ, spacing } from '../../src/theme';
import { Button } from '../../src/components/ui/Button';
import { IconArrowLeft } from '../../src/components/ui/icons';

export default function ProfileMethodScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Button variant="ghost" onPress={() => router.back()}>
          <IconArrowLeft size={20} color={colors.accent} />
        </Button>

        <Text style={styles.step}>2 / 3</Text>
        <Text style={styles.title}>Twoj profil</Text>
        <Text style={styles.subtitle}>
          Jak chcesz utworzyc swoj profil?
        </Text>

        <View style={styles.buttons}>
          <Button
            title="Porozmawiaj ze mna"
            variant="accent"
            onPress={() => router.push('/onboarding/profiling')}
          />
          <Text style={styles.hint}>
            Odpowiesz na kilka pytan, a my stworzymy Twoj profil
          </Text>

          <View style={styles.separator} />

          <Button
            title="Opisze sie sam"
            variant="ghost"
            onPress={() => router.push('/onboarding/bio')}
          />
          <Text style={styles.hint}>
            Sam napiszesz bio i opis kogo szukasz
          </Text>
        </View>

        <Text style={styles.footer}>
          Zawsze mozesz zmienic swoj profil pozniej
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.section,
    paddingTop: 60,
  },
  step: {
    ...typ.caption,
    marginBottom: spacing.tight,
    marginTop: spacing.section,
  },
  title: {
    ...typ.display,
    marginBottom: spacing.tight,
  },
  subtitle: {
    ...typ.body,
    color: colors.muted,
    marginBottom: spacing.block,
  },
  buttons: {
    gap: spacing.tight,
  },
  hint: {
    ...typ.caption,
    textAlign: 'center',
    marginBottom: spacing.column,
  },
  separator: {
    height: 1,
    backgroundColor: colors.rule,
    marginVertical: spacing.column,
  },
  footer: {
    ...typ.caption,
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: spacing.block,
  },
});
