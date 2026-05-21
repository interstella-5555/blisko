# `e2e` — Maestro end-to-end test conventions

E2E flows live in `apps/mobile/.maestro/`. We use [Maestro](https://maestro.dev) running on a local iOS simulator (or a physical device — see `apps/mobile/.maestro/config.yaml`).

- `e2e/pl-ua-parity` — every onboarding-style E2E flow must have BOTH a PL and a UA variant. PL is the source (file `<flow>.yaml`), UA is its mirror (`<flow>-ua.yaml`). When you add or edit a PL flow, mirror the change in the UA flow in the same commit/PR. Why: half the app's user base reads UA and we can't ship a regression that only manifests after the user taps the UA pill.

- `e2e/ua-pill-first-step` — UA flows MUST start by tapping the `UA` button on the LocalePill (`id: "locale-pill-ua"`) BEFORE any auth or screen assertion. This is what flips the UI catalog from PL to UA. Pattern (right after `launch-and-dismiss-dev.yaml`):

  ```yaml
  - extendedWaitUntil:
      visible:
        id: "locale-pill-ua"
      timeout: 10000
  - tapOn:
      id: "locale-pill-ua"
  ```

- `e2e/ua-assertion-strings` — assertion strings in UA flows must use the actual UA translation from `apps/mobile/src/locales/ua/messages.po`. Don't paste English or PL strings into `visible:` / `assertVisible:` and expect Maestro to match. If a string isn't translated yet, run `bun run mobile:i18n:translate` first or use a `testID` instead.

- `e2e/prefer-testid` — when both options work, prefer matching by `testID` over visible text. `testID` survives copy edits and translations; text-based matchers break on every wording change. Reserve text matchers for cases where the visible text IS what we're verifying.

- `e2e/scripts-pl-ua-split` — `bun run mobile:test:e2e` runs everything (full sweep). For faster local iteration use:
  - `bun run mobile:test:e2e:pl` — PL flows only
  - `bun run mobile:test:e2e:ua` — UA flows only

  When adding a new flow, add it to BOTH `test:e2e:pl` and `test:e2e:ua` script lists in `apps/mobile/package.json` (paired with its UA mirror).

- `e2e/cyrillic-input-limitation` — Maestro `inputText` on iOS Simulator does NOT type Cyrillic reliably (keyboard mapping issue). When a UA flow needs user-typed text, type ASCII (the message body content is in PL/transliterated for the test only) — the assertion side can still match Cyrillic UI strings because those come from the bundle, not from `inputText`. This is why the existing `onboarding-ua.yaml` types Polish answers under UA UI prompts.
