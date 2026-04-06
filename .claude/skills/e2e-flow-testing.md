---
name: e2e-flow-testing
description: "Use when creating E2E tests for user flows. Guided process: reads PRODUCT.md + architecture docs, describes expected flow behavior, asks user for approval before writing Maestro test. Prevents false positives by confirming intended behavior first. Triggers: 'e2e test', 'test flow', 'maestro test', 'create e2e', 'flow testing', '/e2e-flow-testing'."
---

# E2E Flow Testing — Guided Test Creation

Create Maestro E2E tests flow-by-flow with user approval at each step. Prevents false positives by confirming expected behavior before writing tests.

## Why This Process

Writing E2E tests without confirming expected behavior creates false positives — tests that pass on broken flows or fail on correct ones. Every test must be approved by the user before entering the suite.

## Procedure

### 1. Select a flow to test

Read `docs/architecture/e2e-test-coverage.md` to see which flows are untested. Pick the next untested flow, or let the user choose.

### 2. Research expected behavior

Read relevant sources:
- `PRODUCT.md` — product vision for this flow
- `docs/architecture/*.md` — current implementation details
- Existing Maestro tests in `apps/mobile/.maestro/` — patterns and conventions
- Mobile screens in `apps/mobile/app/` — actual UI structure

### 3. Present flow to user

Describe the flow step-by-step:

```
## Flow: [Name]

### Steps:
1. User opens app → sees [screen]
2. User taps [element] → navigates to [screen]
3. User enters [data] → [validation happens]
4. System [does X] → user sees [result]

### What this test verifies:
- [assertion 1]
- [assertion 2]

### Edge cases covered:
- [edge case 1]
```

**Ask:** "Czy ten flow tak powinien wyglądać? Coś do zmiany?"

### 4. Wait for approval

- **"tak"** → proceed to write test
- **"nie, powinno być X"** → update flow description, re-present
- **"skip this flow"** → mark as skipped in coverage doc, move to next

### 5. Write Maestro test

Follow existing patterns in `.maestro/`. Use:
- `appId: app.blisko.mobile`
- `launchApp` with clear state where needed
- Descriptive step names
- Assertions on visible text/elements

### 6. Run and fix

```bash
cd apps/mobile && maestro test .maestro/[test-name].yaml
```

Fix until passing. If the test reveals a bug in the app → report to user, don't "fix" the test to pass on broken behavior.

### 7. Show to user for final approval

Show the passing test. User approves → commit. User rejects → revise.

### 8. Update coverage doc

Mark flow as tested in `docs/architecture/e2e-test-coverage.md`.

## Flow Discovery

To find flows to test, check these sources:
- `PRODUCT.md` § "System interakcji" — core interaction flows
- `PRODUCT.md` § "Profil użytkownika" — onboarding flows
- `docs/architecture/waves-connections.md` — ping/wave flows
- `docs/architecture/messaging.md` — chat flows
- `docs/architecture/groups-discovery.md` — group flows
- `docs/architecture/status-matching.md` — status flows
- `docs/architecture/auth-sessions.md` — auth flows
- `docs/architecture/onboarding-flow.md` — onboarding flows
