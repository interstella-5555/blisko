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

- `mobile/conditional-flatlist-needs-key` — When rendering two or more `FlatList` / `SectionList` / `VirtualizedList` instances in the same JSX position via ternary or `&&` (`showX ? <FlatList ... /> : <FlatList ... />`), **give each one a distinct `key` prop**. Otherwise React reuses the same instance across branches and props get mutated on the fly — which crashes with `Invariant Violation: Changing onViewableItemsChanged nullability on the fly is not supported` the moment one branch has `onViewableItemsChanged`/`viewabilityConfig` and the other doesn't. The invariant is a hard error in release builds (SIGABRT, whole app dies). Applies to any mount-time-only prop on virtualized lists, not only viewability — including `horizontal`, `inverted`, `keyboardShouldPersistTaps`. Rule of thumb: if two same-type lists in the same position have **any** structural differences in props, add `key="list-a"` and `key="list-b"`. Root cause fixed in `chats.tsx` pings vs conversations lists — see architecture doc "Gotchas" section.
