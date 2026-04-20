---
name: bugsink
description: "Use when investigating errors in Bugsink (self-hosted Sentry-compatible error tracker) for the Blisko project. Triggers: 'check bugsink', 'bugsink errors', 'production errors', 'any bugs in bugsink', 'open issues in bugsink', 'resolve bugsink issue'."
---

# Bugsink — Blisko Error Tracking

Self-hosted Sentry-compatible instance at `https://bugsink.up.railway.app/`. Hosts two projects for Blisko.

## Source of truth

**Always consult the live OpenAPI schema — it is the authoritative, up-to-date contract.** Do not guess endpoints or assume a response shape without checking.

- Swagger UI: https://bugsink.up.railway.app/api/canonical/0/schema/swagger-ui/
- Raw schema (JSON): https://bugsink.up.railway.app/api/canonical/0/schema/?format=json
- API root: `https://bugsink.up.railway.app/api/canonical/0/`

If this skill looks out of date vs the schema, the schema wins — update the skill.

## Projects

| ID | Name | Receives errors from |
|----|------|----------------------|
| 1 | `blisko-api` | `apps/api` (Hono + tRPC + BullMQ workers) — DSN on Railway api service |
| 2 | `blisko-chatbot` | `apps/chatbot` (seed-user responder) — DSN on Railway chatbot service |

Mobile / admin / website / design are not wired yet (BLI-244 scope was server-side only).

## Auth

Personal API token lives in `~/.bugsinkrc`:

```
BUGSINK_URL=https://bugsink.up.railway.app
BUGSINK_TOKEN=<40-char hex>
```

Use as a Bearer token: `Authorization: Bearer $BUGSINK_TOKEN`.

If the file is missing, ask the user to create one — generate the token from the Bugsink web UI (logged-in user menu → API Tokens). The DSN values you find on Railway services are NOT API tokens; they're per-project ingest secrets, useless for the management API.

## Usage

Load env, hit the API:

```bash
set -a; source ~/.bugsinkrc; set +a
curl -sS -H "Authorization: Bearer $BUGSINK_TOKEN" "$BUGSINK_URL/api/canonical/0/projects/" | jq
```

For any endpoint beyond `/projects/`, resolve verb and path against the OpenAPI schema above.

## Common queries

Cover ~80% of asks. Refer to OpenAPI for anything else.

```bash
# All issues for blisko-api (most recent first by default)
curl -sS -H "Authorization: Bearer $BUGSINK_TOKEN" \
  "$BUGSINK_URL/api/canonical/0/issues/?project=1" | jq

# Open (unresolved) issues only — server has no is_resolved filter, do it client-side
curl -sS -H "Authorization: Bearer $BUGSINK_TOKEN" \
  "$BUGSINK_URL/api/canonical/0/issues/?project=1" \
  | jq '.results | map(select(.is_resolved == false))'

# Single issue (UUID from the list above)
curl -sS -H "Authorization: Bearer $BUGSINK_TOKEN" \
  "$BUGSINK_URL/api/canonical/0/issues/<issueId>/" | jq

# Events for an issue (most recent first)
curl -sS -H "Authorization: Bearer $BUGSINK_TOKEN" \
  "$BUGSINK_URL/api/canonical/0/events/?issue=<issueId>&order=-timestamp" | jq

# Full stack trace for one event
curl -sS -H "Authorization: Bearer $BUGSINK_TOKEN" \
  "$BUGSINK_URL/api/canonical/0/events/<eventId>/stacktrace/" | jq
```

## Mutations

The management API is read-only for issues and events (no `PATCH`/`DELETE` in the schema — verify before assuming). To resolve or mute, drive the web UI with `agent-browser`. Session cookies persist between runs, so a previous login usually carries over.

Bulk-resolve recipe:

```bash
agent-browser open "$BUGSINK_URL/issues/<projectId>/"
agent-browser snapshot -i
# Snapshot reveals refs (@e1, @e2…). Find the header-row select-all checkbox
# and the "Resolve" button by their visible labels in the snapshot output, then:
agent-browser click @<the-select-all-ref>
agent-browser click @<the-resolve-ref>
```

Verify via API: `GET /api/canonical/0/issues/?project=<id>` then jq-filter for `is_resolved == false` — should be empty.

## Gotchas

- **`?project=` takes the integer id, not the slug.** `?project=blisko-api` returns nothing useful; `?project=1` works.
- **No server-side `is_resolved` filter.** Filter `.results` client-side with jq. The schema only exposes `cursor`, `order`, `sort`, `project` on `/issues/`.
- **`digested_event_count` ≠ `stored_event_count`.** Bugsink keeps the per-project event store bounded by `retention_max_event_count` (10 000 by default). After the cap, oldest events drop but `digested_event_count` keeps incrementing as the canonical "how many times this happened" counter.
- **DSN ≠ API token.** DSN is a per-project ingest secret (used by the SDKs); API token is a personal management credential (used here). Never paste a DSN into `BUGSINK_TOKEN` — you'll get 401s.
- **401 = expired/wrong token. 404 on a valid-looking id = bad project/issue id (or never existed).** Distinguish before flailing.
- **`agent-browser` cookies persist.** A login from a prior session survives across `agent-browser open` invocations until they expire — re-login only if you start hitting `/accounts/login/` redirects.

## Related

- Architecture: `docs/architecture/instrumentation.md` — init contract, `beforeSend` scrubbing, capture sites.
- Infra: `docs/architecture/infrastructure.md` § "Bugsink (Error Tracking)" — Railway project, DSN injection.
- SDK init: `apps/api/src/services/sentry.ts`, `apps/chatbot/src/sentry.ts`.
