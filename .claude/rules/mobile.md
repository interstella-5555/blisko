# `mobile` — React Native / Expo conventions

- `mobile/no-native-headers` — **NEVER** use React Navigation's native header (`headerLeft`, `headerRight`, `headerStyle`, etc.). iOS wraps them in `UIBarButtonItem` with an ugly capsule background we can't remove. Always use `header: () => (...)` in `screenOptions` for fully custom headers.

  Standard pattern — SafeAreaView + centered title + back chevron:
  ```tsx
  header: ({ options }) => (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.bg }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.section, height: 58,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ width: 24 }}>
          <IconChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontFamily: fonts.serif, fontSize: 18, color: colors.ink }}>
          {options.title}
        </Text>
        <View style={{ width: 24 }} />
      </View>
    </SafeAreaView>
  ),
  contentStyle: { backgroundColor: colors.bg },
  ```

- `mobile/back-button` — Always `IconChevronLeft` from `@/components/ui/icons`, size 24, color `colors.ink`, `hitSlop={8}`. No text next to chevron (no "Wróć"/"Back"). Consistent across all headers.

- `mobile/align-with-first-line` — When placing a Switch/toggle next to label + description, put only the label and the control in a flex row with `alignItems: 'center'`. Render description as a separate element below. Otherwise the control centers against the whole block (label + description), not just the label.

- `mobile/no-expo-go` — Never use `npx expo start` / Expo Go. Native modules (expo-notifications etc.) require a dev client build.

- `mobile/no-eas` — Don't suggest EAS Build or EAS Submit. We use local Xcode builds + manual upload via Xcode Organizer. When using EAS CLI (e.g. for credentials), always `npx -y eas-cli@latest <command>`.
