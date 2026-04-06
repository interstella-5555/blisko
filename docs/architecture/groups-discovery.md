# Groups & Discovery

> v1 — AI-generated from source analysis, 2026-04-06.

Source: `apps/api/src/trpc/procedures/groups.ts`, `apps/api/src/db/schema.ts`, `packages/shared/src/validators.ts`.
Design decisions: `docs/architecture/nearby-group-members.md`.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI (Polish) |
|-----------------|-----------|-------------|
| Grupy (Premium+) | `conversations` with `type = 'group'` | "Grupy" tab |
| Tryb sesyjny | Not implemented | -- |
| Tryb staly | Standard group membership | "Dolacz" button |
| Czat grupowy | Group conversation | Group chat screen |
| Dołącz | `joinDiscoverable` / `join` | "Dolacz" / invite link |
| W pobliżu | `getNearbyMembers` | "W pobliżu (N)" section |

PRODUCT.md envisions two group modes (session-based and permanent). Only permanent membership is implemented. Session mode and group events (admin creates with date/time/place) are not built.

---

## Group Model

Groups reuse the `conversations` table with `type = 'group'`. This unifies DM and group chat under one message pipeline.

**What:** A group is a conversation row with group-specific columns populated.

**Why:** Shared infrastructure means messages, reactions, typing indicators, and WS events work identically for DMs and groups without branching logic.

**Config — conversations table (group-relevant columns):**

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `type` | varchar(10) | `'dm'` | Set to `'group'` for groups |
| `name` | varchar(100) | null | Group display name |
| `description` | text | null | Group description (max 500 via validator) |
| `avatarUrl` | text | null | Group avatar image URL |
| `inviteCode` | varchar(20) | null | Unique join code, 12 chars |
| `creatorId` | text FK → user | null | Creator's user ID |
| `maxMembers` | integer | 200 | Hard cap enforced in serializable tx |
| `latitude` | real | null | Anchor location for discovery |
| `longitude` | real | null | Anchor location for discovery |
| `isDiscoverable` | boolean | false | Whether group appears in nearby search |
| `discoveryRadiusMeters` | integer | 5000 | Max distance for discovery queries |
| `metadata` | jsonb | null | Unused for groups (used by DMs for status snapshots) |
| `deletedAt` | timestamp | null | Soft-delete marker |

Indexes: `conversations_type_idx`, `conversations_invite_code_idx`, `conversations_location_idx`, `conversations_discoverable_idx`.

---

## Roles & Permissions

Members are tracked in `conversation_participants` with a composite PK `(conversationId, userId)`.

| Role | Who gets it | Can update group | Can manage members | Can change roles | Can transfer ownership |
|------|-------------|------------------|--------------------|------------------|----------------------|
| `owner` | Creator (exactly one per group) | Yes | Yes | Yes | Yes |
| `admin` | Promoted by owner | Yes | Yes | No | No |
| `member` | Default for joiners | No | No | No | No |

**What:** Role hierarchy is `owner > admin > member`. The `requireGroupParticipant` helper enforces `minRole` checks on every mutation.

**Why:** Owner is the only role that can transfer ownership or change roles, preventing admin power grabs. Admin can do everything except role changes. Member can only participate in chat.

**Config:** Role stored as `varchar(10)` on `conversation_participants.role`, default `'member'`.

---

## Create Group

**What:** Creates a conversation row, adds creator as owner, optionally adds initial members, and creates a default topic.

**Why:** The default topic ensures every group has at least one topic for message organization from day one.

**Config:**
- Feature-gated: `groups.create` (requires completed profile)
- Default topic: name `"Ogólny"`, emoji `"💬"`, pinned, sort order 0
- Initial members: max 199 via validator (+ creator = 200 cap)
- Creator role: `owner`

**Invite code generation:** 12 random characters from `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789` (54 chars). Excluded: `I`, `l`, `O`, `0`, `1` — visually ambiguous characters. Entropy: ~68.4 bits (54^12).

**Side effects (outside transaction):**
- `groupInvited` WS event to each invited member
- Push notification: title = group name (or "Grupa"), body = "Nowe zaproszenie do grupy"

---

## Join Group

Two paths into a group:

#### Via invite code (`groups.join`)
Looks up conversation by `inviteCode` + `type = 'group'`. No discoverability check. No feature gate.

#### Via discovery (`groups.joinDiscoverable`)
Requires `isDiscoverable = true`. Feature-gated: `groups.joinDiscoverable`.

**Both paths share the same member-cap race protection:**

**What:** Serializable isolation transaction that checks existing membership, counts current members, and inserts if under cap.

**Why:** Without serializable isolation, two concurrent joins could both read count = 199 and both insert, exceeding the 200-member cap. Serializable makes one transaction retry, seeing the updated count.

**Config:** `maxMembers` default 200, enforced as `Number(count) >= (conv.maxMembers ?? 200)`.

**Side effects (outside transaction):**
- `groupMember` WS event with action `"joined"` + display name
- No push notification for discoverable joins (only for invite-code joins when added by admin)

---

## Discovery

**What:** `groups.getDiscoverable` returns nearby discoverable groups sorted by distance, with member counts and nearby member counts.

**Why:** Haversine formula gives accurate great-circle distance. Nearby member count lets users see group activity before joining.

**Config:**
- Input: `latitude`, `longitude`, `radiusMeters` (100-50000, default 5000), `limit` (1-50, default 20), `cursor` (offset)
- Filters: `type = 'group'`, `isDiscoverable = true`, `deletedAt IS NULL`, within radius
- Soft-delete filter: member counts use `INNER JOIN "user" u ON ... AND u.deleted_at IS NULL`
- Nearby member count subquery: checks `location_visible = true`, `latitude IS NOT NULL`, and haversine distance <= radiusMeters
- Results ordered by distance ascending

---

## Member Management

#### Add member (`groups.addMember`)
Admin-only. Serializable transaction (same cap protection as join). Emits `groupMember` + `groupInvited` WS events. Sends push notification.

#### Remove member (`groups.removeMember`)
Admin-only. Cannot remove the owner. Hard delete from `conversation_participants`. Emits `groupMember` WS event with action `"removed"`.

#### Leave (`groups.leave`)
Any member except owner. Owner must transfer ownership first — prevents orphaned groups.

#### Transfer ownership (`groups.transferOwnership`)
Owner-only. Atomic transaction: sets target to `owner`, demotes old owner to `admin`, updates `creatorId` on conversation. Two `groupMember` WS events (one per role change).

**Why atomic transaction:** If the owner demotion and new-owner promotion were separate operations, a crash between them could leave a group with zero or two owners.

#### Set role (`groups.setRole`)
Owner-only. Can set `admin` or `member`. Cannot change the owner's role (must use `transferOwnership`).

#### Regenerate invite code (`groups.regenerateInviteCode`)
Admin-only. Generates a new 12-char code, invalidating the old one.

---

## Nearby Members

**What:** `groups.getNearbyMembers` returns group members within a radius, sorted by distance.

**Why:** Shows which group members are physically nearby, enabling spontaneous meetups — core to the "physical proximity" product pillar.

**Config:**
- Input: `radiusMeters` (100-50000, default 5000), `limit` (1-20, default 20)
- Excludes: the requesting user, soft-deleted users (`INNER JOIN user WHERE deletedAt IS NULL`)
- Respects `locationVisible` toggle: only members with `location_visible = true` appear
- Returns: `totalNearby` count + paginated member list with display name, avatar, rounded distance

#### Display caps (from design doc)

| Group size | Nearby count | UI behavior |
|-----------|-------------|-------------|
| <=5 members | Any | Single "Czlonkowie" list with distance badges, no separate section |
| >5 members | 0 | No nearby section shown |
| >5 members | 1-5 | "W pobliżu (N)" card with member rows |
| >5 members | >5 | 5 closest shown + "Pokaż w pobliżu" expands to max 20 (API cap) |
| Any | 50+ | Full member list on separate screen with FlatList + pagination by 50 |

#### Location visibility (`groups.setLocationVisibility`)
Per-member opt-out toggle. Default `true`. Stored as `location_visible` on `conversation_participants`. Users with `location_visible = false` are excluded from both the nearby member list and the nearby member count in discovery.

---

## Group Info (`groups.getGroupInfo`)

**What:** Returns group details. Response shape differs based on membership.

**Members get:** Full conversation object, topic list (sorted by pinned > sort order > last message), member count, `locationVisible` toggle state, invite code.

**Non-members get:** Name, description, avatar, discoverability status, member count, location. No topics, no invite code, no creator ID. Non-members can only view discoverable groups — non-discoverable groups return FORBIDDEN.

---

## WebSocket Events

| Event | Trigger | Broadcast target |
|-------|---------|-----------------|
| `groupMember` | Join, leave, remove, role change | All conversation subscribers |
| `groupUpdated` | Name/description/avatar change | All conversation subscribers |
| `groupInvited` | Create with members, admin add | Specific invited user |

When a member leaves or is removed, the WS handler removes their subscription to the conversation channel, preventing stale event delivery.

---

## Soft-Delete Filtering

Groups check `deletedAt IS NULL` in:
- `requireGroup` helper (used by update, join, leave, add/remove member, set role, transfer, get info)
- Discovery query (`getDiscoverable`)
- Member count subqueries (INNER JOIN to user table with `deleted_at IS NULL`)
- Nearby member queries

---

## Impact Map

If you change this system, also check:
- **`apps/api/src/trpc/procedures/messages.ts`** — `getConversations` fetches groups alongside DMs; `deleteConversation` blocks group deletion
- **`apps/api/src/trpc/procedures/topics.ts`** — topic CRUD requires group participant verification
- **`apps/api/src/ws/handler.ts`** — WS subscription management for group members (subscribe, auto-unsubscribe on leave/remove)
- **`apps/api/src/services/push.ts`** — group push uses `collapseId` for unread suppression
- **`apps/api/src/db/schema.ts`** — `conversations`, `conversationParticipants`, `topics` table definitions
- **`packages/shared/src/validators.ts`** — group validators (createGroupSchema, updateGroupSchema, joinGroupSchema, etc.)
- **`apps/api/src/services/data-export.ts`** — GDPR export includes group memberships
- **`docs/architecture/nearby-group-members.md`** — detailed design decisions for nearby member display caps and privacy
