---
name: maestro
description: Use when writing, debugging, or modifying Maestro E2E tests for the mobile app. Triggers on "e2e test", "maestro", "write test", "fix test", "add testID", "onboarding test", "test flow".
---

# Maestro E2E Testing

Guide for writing Maestro tests in the Blisko Expo/React Native mobile app. For full best practices reference, read `references/best-practices.md`.

## Project Setup

- Tests: `apps/mobile/.maestro/`
- Sub-flows: `apps/mobile/.maestro/sub-flows/`
- App ID: `com.blisko.app`
- URI scheme: `blisko://`

### Running Tests

```bash
# Local (iOS simulator, dev client + Metro)
maestro test apps/mobile/.maestro/onboarding.yaml

# Local (Android emulator, release build)
maestro test -e RELEASE_BUILD=true apps/mobile/.maestro/onboarding.yaml

# CI (release build, no Metro)
maestro test -e RELEASE_BUILD=true apps/mobile/.maestro/onboarding.yaml
```

### Dev vs Release Builds

`sub-flows/launch-and-dismiss-dev.yaml` handles both modes:
- **Default (local):** Connects to Metro dev server, dismisses dev menus
- **`RELEASE_BUILD=true` (CI):** Skips dev launcher steps

## Selector Rules (STRICT)

1. **Always use `testID` (`id:`)** for interactive elements (buttons, inputs, toggles, tabs)
2. **Use `text:` with `(?i)` prefix** for text assertions and navigation labels — handles Android `textTransform: uppercase`
3. **NEVER use `point: "X%,Y%"`** — breaks across screen sizes and devices
4. **NEVER use `index:`** — use relative selectors (`below:`, `above:`, `childOf:`) instead

```yaml
# GOOD
- tapOn:
    id: "submit-button"
- extendedWaitUntil:
    visible: "(?i)Dalej"

# BAD — breaks across devices
- tapOn:
    point: "50%,96%"
```

### testID Naming Convention

```
{component}-{type}[-{variant}]
```

Examples: `email-input`, `send-link-button`, `wave-button`, `tab-nearby`, `age-confirm-toggle`, `fill-profile-button`

### When adding new testIDs to app code

Add `testID="name"` prop to the React Native component. Both `<Pressable>`, `<Button>`, `<TextInput>`, and `<Switch>` support `testID`.

## Text Matching Rules

- **Android renders `textTransform: uppercase`** in the accessibility tree — "Dalej" becomes "DALEJ"
- **iOS keeps original casing** in the accessibility tree
- **Always use `(?i)` regex prefix** for button/label text: `"(?i)Dalej"` matches both
- **`(?i)` does NOT work with `|` alternation** in Maestro — use separate checks instead
- **Maestro `inputText` does NOT support Unicode** (Polish diacritics: ś, ó, ę, ą, ź, ż, ć, ń, ł). Write Polish text without diacritics: "Szukam ludzi do wspolnych projektow"

## Flow Structure

```yaml
appId: com.blisko.app
---
# {Feature} {Action} Test
# Tests: {what this validates}

- runFlow: sub-flows/launch-and-dismiss-dev.yaml

# --- AUTH ---
# ... login steps

# --- NAVIGATE ---
# ... navigate to feature

# --- ACT ---
# ... perform action

# --- VERIFY ---
- assertVisible:
    id: "expected-element"
```

### Validation Between Steps

Always verify screen state between chained actions:

```yaml
# GOOD — validate each transition
- tapOn: "(?i)Dalej"
- extendedWaitUntil:
    visible: "Krok 2"
    timeout: 5000
- tapOn: "(?i)Dalej"

# BAD — chaining without validation
- tapOn: "(?i)Dalej"
- tapOn: "(?i)Dalej"
```

## Keyboard Handling

Always dismiss keyboard after `inputText` before tapping buttons:

```yaml
- tapOn:
    id: "name-input"
- inputText: "Test User"
- hideKeyboard               # ALWAYS before next tap
- tapOn: "(?i)Dalej"
```

## Handling Dynamic Content

### Non-deterministic screens (AI follow-ups, loading states)

```yaml
# Conditional execution — only runs if element is visible RIGHT NOW
- runFlow:
    when:
      visible:
        id: "question-input"
    commands:
      - tapOn:
          id: "question-input"
      - inputText: "Answer text"
      - tapOn: "(?i)Dalej"
```

### Timeouts

| Scenario | Timeout |
|----------|---------|
| App launch + auth | 30000ms |
| Screen navigation | 5000-10000ms |
| Network requests | 10000-15000ms |
| AI generation | 300000-600000ms |

## Permissions

```yaml
- launchApp:
    clearState: true
    permissions:
      location: allow          # NOT "always" — "allow" is the standard
      notifications: allow
```

## Auth Pattern (Dev Shortcut)

`@example.com` emails auto-login (bypass OTP). Use for all E2E tests:

```yaml
- tapOn:
    id: "email-input"
- inputRandomNumber
- inputText: "@example.com"
- hideKeyboard
- tapOn:
    id: "send-link-button"
```

## Cross-Platform Gotchas

| Issue | iOS | Android |
|-------|-----|---------|
| `textTransform: uppercase` | Accessibility tree has original case | Accessibility tree has uppercase |
| `clearState: true` | Does NOT clear Keychain (tokens persist) | Fully resets app data |
| `hideKeyboard` | Works | Works |
| `inputText` Unicode | Supports Polish chars | Does NOT support (use ASCII) |
| Permission dialogs | Auto-granted via `permissions:` | May show runtime dialog |

**Because of the Unicode limitation on Android, always write text without Polish diacritics.** This works on both platforms.

## Debugging

```bash
maestro test --debug flow.yaml     # Step through
maestro hierarchy                   # View element tree
maestro studio                      # Interactive builder
```

Check screenshots in `~/.maestro/tests/` after failures.
