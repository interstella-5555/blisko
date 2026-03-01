# Nearby Group Members Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show which group members are nearby — on the map, in group list rows, and on the group detail screen.

**Architecture:** New DB column `location_visible` on `conversation_participants` for opt-out privacy. New API endpoints for nearby members (capped at 20) and paginated members list. Mobile: group markers on map (rounded square), nearby badge in GroupRow, nearby section on group detail screen, separate fullscreen members list.

**Tech Stack:** Drizzle ORM (Postgres), tRPC, React Native (Expo), react-native-maps

**Design doc:** `docs/plans/2026-03-01-nearby-group-members-design.md`

---

### Task 1: DB Migration — `location_visible` column

**Files:**
- Modify: `apps/api/src/db/schema.ts:159-178`
- Create: `apps/api/drizzle/XXXX_add-location-visible.sql` (generated)

**Step 1: Add column to schema**

In `apps/api/src/db/schema.ts`, add `locationVisible` to the `conversationParticipants` table definition, after the `joinedAt` line:

```typescript
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    locationVisible: boolean('location_visible').default(true).notNull(),
```

Add `boolean` to the drizzle-orm import at the top of the file if not already there.

**Step 2: Generate migration**

Run: `cd apps/api && npx drizzle-kit generate --name=add-location-visible`

Expected: Creates a SQL migration file in `apps/api/drizzle/`.

**Step 3: Apply migration**

Run: `cd apps/api && npx drizzle-kit migrate`

**Step 4: Commit**

```
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "Add location_visible column to conversation_participants (BLI-7)"
```

---

### Task 2: API — `groups.getNearbyMembers` endpoint

**Files:**
- Modify: `apps/api/src/trpc/procedures/groups.ts`

**Step 1: Add the endpoint**

Add inside the `groupsRouter` (before the closing `});`), after `getGroupInfo`:

```typescript
  getNearbyMembers: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().min(100).max(50000).default(5000),
        limit: z.number().min(1).max(20).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { conversationId, latitude, longitude, radiusMeters, limit } = input;

      // Count total nearby (for the "(400)" in title) — no cap
      const distanceSql = sql<number>`
        6371000 * acos(
          cos(radians(${latitude})) * cos(radians(${profiles.latitude})) *
          cos(radians(${profiles.longitude}) - radians(${longitude})) +
          sin(radians(${latitude})) * sin(radians(${profiles.latitude}))
        )
      `;

      const baseWhere = and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.locationVisible, true),
        sql`${profiles.latitude} IS NOT NULL`,
        sql`${distanceSql} <= ${radiusMeters}`,
        sql`${conversationParticipants.userId} != ${ctx.userId}`
      );

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversationParticipants)
        .innerJoin(profiles, eq(conversationParticipants.userId, profiles.userId))
        .where(baseWhere);

      const totalNearby = Number(countResult.count);

      // Fetch capped list sorted by distance
      const members = await db
        .select({
          userId: conversationParticipants.userId,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
          distance: distanceSql.as('distance'),
        })
        .from(conversationParticipants)
        .innerJoin(profiles, eq(conversationParticipants.userId, profiles.userId))
        .where(baseWhere)
        .orderBy(sql`distance`)
        .limit(limit);

      return {
        totalNearby,
        members: members.map((m) => ({
          ...m,
          distance: Math.round(m.distance),
        })),
      };
    }),
```

This endpoint does NOT require group membership — non-members of discoverable groups can also see nearby members. It excludes the calling user and respects `locationVisible`.

**Step 2: Commit**

```
git add apps/api/src/trpc/procedures/groups.ts
git commit -m "Add getNearbyMembers endpoint (BLI-7)"
```

---

### Task 3: API — extend `getDiscoverable` with `nearbyMemberCount`

**Files:**
- Modify: `apps/api/src/trpc/procedures/groups.ts` (the `getDiscoverable` procedure, ~lines 547-587)

**Step 1: Add nearbyMemberCount subquery**

Inside `getDiscoverable`, add a correlated subquery to the `.select({...})` block:

```typescript
nearbyMemberCount: sql<number>`(
  SELECT count(*) FROM conversation_participants cp
  INNER JOIN profiles p ON cp.user_id = p.user_id
  WHERE cp.conversation_id = ${conversations.id}
    AND cp.location_visible = true
    AND p.latitude IS NOT NULL
    AND 6371000 * acos(
      cos(radians(${latitude})) * cos(radians(p.latitude)) *
      cos(radians(p.longitude) - radians(${longitude})) +
      sin(radians(${latitude})) * sin(radians(p.latitude))
    ) <= ${radiusMeters}
)`.as('nearby_member_count'),
```

In the return mapping, add:

```typescript
nearbyMemberCount: Number(g.nearbyMemberCount),
```

**Step 2: Commit**

```
git add apps/api/src/trpc/procedures/groups.ts
git commit -m "Add nearbyMemberCount to getDiscoverable response (BLI-7)"
```

---

### Task 4: API — `groups.setLocationVisibility` + extend `getGroupInfo`

**Files:**
- Modify: `apps/api/src/trpc/procedures/groups.ts`

**Step 1: Add setLocationVisibility mutation**

```typescript
  setLocationVisibility: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        visible: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireGroupParticipant(input.conversationId, ctx.userId);

      await db
        .update(conversationParticipants)
        .set({ locationVisible: input.visible })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      return { ok: true };
    }),
```

**Step 2: Extend `getGroupInfo` to return `locationVisible`**

In the `getGroupInfo` procedure, for the **member** return path (where `isMember === true`), add `locationVisible` from the participant record. The participant is already fetched at the top of `getGroupInfo`:

```typescript
const [participant] = await db.select().from(conversationParticipants)
  .where(and(eq(...conversationId), eq(...userId)));
```

Add `locationVisible: participant.locationVisible` to the member return object.

**Step 3: Add paginated `getMembers` overload**

Modify the existing `getMembers` to accept optional `limit` and `cursor`:

```typescript
  getMembers: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireGroupParticipant(input.conversationId, ctx.userId);

      const members = await db
        .select({
          userId: conversationParticipants.userId,
          role: conversationParticipants.role,
          joinedAt: conversationParticipants.joinedAt,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(conversationParticipants)
        .innerJoin(profiles, eq(conversationParticipants.userId, profiles.userId))
        .where(eq(conversationParticipants.conversationId, input.conversationId))
        .orderBy(
          sql`CASE ${conversationParticipants.role}
            WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
          conversationParticipants.joinedAt
        )
        .limit(input.limit)
        .offset(input.cursor ?? 0);

      return members;
    }),
```

**Step 4: Commit**

```
git add apps/api/src/trpc/procedures/groups.ts
git commit -m "Add setLocationVisibility, paginated getMembers, locationVisible in getGroupInfo (BLI-7)"
```

---

### Task 5: Mobile — extract `formatDistance` to shared util

**Files:**
- Create: `apps/mobile/src/lib/format.ts`
- Modify: `apps/mobile/src/components/nearby/GroupRow.tsx`
- Modify: `apps/mobile/src/components/nearby/UserRow.tsx`

**Step 1: Create shared utility**

```typescript
// apps/mobile/src/lib/format.ts
export const formatDistance = (meters: number): string => {
  if (meters < 50) return 'tuż obok';
  const rounded = Math.round(meters / 100) * 100;
  if (rounded < 1000) return `~${rounded} m`;
  return `~${(rounded / 1000).toFixed(1)} km`;
};
```

**Step 2: Update GroupRow and UserRow to import from shared**

Replace the local `formatDistance` definitions with:

```typescript
import { formatDistance } from '../../lib/format';
```

**Step 3: Commit**

```
git add apps/mobile/src/lib/format.ts apps/mobile/src/components/nearby/GroupRow.tsx apps/mobile/src/components/nearby/UserRow.tsx
git commit -m "Extract formatDistance to shared utility (BLI-7)"
```

---

### Task 6: Mobile — `GroupMarker` component

**Files:**
- Create: `apps/mobile/src/components/nearby/GroupMarker.tsx`
- Modify: `apps/mobile/src/components/nearby/index.ts`

**Step 1: Create GroupMarker**

Rounded square avatar with optional green badge showing nearby count.

```typescript
// apps/mobile/src/components/nearby/GroupMarker.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Avatar } from '../ui/Avatar';

interface GroupMarkerProps {
  name: string | null;
  avatarUrl: string | null;
  nearbyCount: number;
}

export function GroupMarker({ name, avatarUrl, nearbyCount }: GroupMarkerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.avatarWrap}>
        <Avatar uri={avatarUrl} name={name ?? 'G'} size={40} />
      </View>
      {nearbyCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{nearbyCount}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 46,
    height: 46,
    position: 'relative',
  },
  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
});
```

Note: The `Avatar` component has `borderRadius = size / 2` (circle). For the rounded square look, the outer `avatarWrap` with `borderRadius: 12` + `overflow: 'hidden'` will clip the circular Avatar into a rounded square. This avoids modifying the Avatar component.

**Step 2: Export from barrel**

Add to `apps/mobile/src/components/nearby/index.ts`:

```typescript
export { GroupMarker } from './GroupMarker';
```

**Step 3: Commit**

```
git add apps/mobile/src/components/nearby/GroupMarker.tsx apps/mobile/src/components/nearby/index.ts
git commit -m "Add GroupMarker component for map (BLI-7)"
```

---

### Task 7: Mobile — add group markers to `NearbyMapView`

**Files:**
- Modify: `apps/mobile/src/components/nearby/NearbyMapView.tsx`
- Modify: `apps/mobile/src/components/nearby/index.ts`

**Step 1: Add group marker data type and prop**

Add a new interface and prop:

```typescript
export interface MapGroup {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  latitude: number;
  longitude: number;
  nearbyMemberCount: number;
}
```

Add to `NearbyMapViewProps`:

```typescript
  groups?: MapGroup[];
  onGroupPress?: (group: MapGroup) => void;
```

**Step 2: Render group markers**

Import `GroupMarker` and add below the cluster markers in the `<MapView>`:

```typescript
{groups?.map((group) => (
  <Marker
    key={`group-${group.id}`}
    coordinate={{
      latitude: group.latitude,
      longitude: group.longitude,
    }}
    onPress={() => onGroupPress?.(group)}
  >
    <GroupMarker
      name={group.name}
      avatarUrl={group.avatarUrl}
      nearbyCount={group.nearbyMemberCount}
    />
  </Marker>
))}
```

**Step 3: Re-export MapGroup from barrel**

Update `index.ts` to include `type MapGroup` in the NearbyMapView export line.

**Step 4: Commit**

```
git add apps/mobile/src/components/nearby/NearbyMapView.tsx apps/mobile/src/components/nearby/index.ts
git commit -m "Add group markers to NearbyMapView (BLI-7)"
```

---

### Task 8: Mobile — pass groups to map + nearby badge in `GroupRow`

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Modify: `apps/mobile/src/components/nearby/GroupRow.tsx`

**Step 1: Update GroupRow to accept `nearbyMemberCount`**

Add optional prop `nearbyMemberCount?: number` to `GroupRowProps`. Below the description text, conditionally render:

```typescript
{nearbyMemberCount != null && nearbyMemberCount > 0 && (
  <Text style={styles.nearbyBadge}>
    {nearbyMemberCount} {nearbyMemberCount === 1 ? 'osoba' : 'osób'} w pobliżu
  </Text>
)}
```

Add style:

```typescript
nearbyBadge: {
  fontFamily: fonts.sans,
  fontSize: 12,
  color: '#5B7A5E',
  marginTop: 4,
},
```

Import `fonts` from theme.

**Step 2: Pass groups to NearbyMapView in index.tsx**

In the `NearbyMapView` component call, add:

```typescript
groups={nearbyFilter !== 'people' ? (nearbyGroups ?? [])
  .filter((g) => g.latitude != null && g.longitude != null)
  .map((g) => ({
    id: g.id,
    name: g.name,
    avatarUrl: g.avatarUrl,
    latitude: g.latitude!,
    longitude: g.longitude!,
    nearbyMemberCount: g.nearbyMemberCount,
  })) : []}
onGroupPress={(group) => router.push(`/(modals)/group/${group.id}`)}
```

**Step 3: Pass `nearbyMemberCount` to GroupRow**

In the FlatList `renderItem` for `'group'` case, add:

```typescript
nearbyMemberCount={g.nearbyMemberCount}
```

**Step 4: Import `MapGroup` type if needed**

Update the import from `../../src/components/nearby` to include `type MapGroup` if TypeScript requires it.

**Step 5: Commit**

```
git add apps/mobile/app/(tabs)/index.tsx apps/mobile/src/components/nearby/GroupRow.tsx
git commit -m "Show group markers on map and nearby badge in GroupRow (BLI-7)"
```

---

### Task 9: Mobile — nearby section on group detail screen

**Files:**
- Modify: `apps/mobile/app/(modals)/group/[id].tsx`

**Step 1: Add nearby members query**

Import `useLocationStore` and `usePreferencesStore`. Add the query:

```typescript
const { latitude, longitude } = useLocationStore();
const { nearbyRadiusMeters } = usePreferencesStore();

const { data: nearbyData } = trpc.groups.getNearbyMembers.useQuery(
  {
    conversationId: conversationId!,
    latitude: latitude!,
    longitude: longitude!,
    radiusMeters: nearbyRadiusMeters,
  },
  { enabled: !!conversationId && !!latitude && !!longitude },
);
```

**Step 2: Add state for expanded nearby**

```typescript
const [showAllNearby, setShowAllNearby] = useState(false);
```

**Step 3: Add nearby section JSX**

Between Wątki and Członkowie sections, render the nearby section:

```typescript
{/* Nearby members */}
{nearbyData && nearbyData.totalNearby > 0 && sortedMembers.length > 5 && (
  <View style={styles.section}>
    <Text style={[styles.sectionTitle, styles.nearbyTitle]}>
      W pobliżu ({nearbyData.totalNearby})
    </Text>
    <View style={styles.nearbyCard}>
      {(showAllNearby ? nearbyData.members : nearbyData.members.slice(0, 5)).map(
        (member) => (
          <Pressable
            key={member.userId}
            style={styles.nearbyRow}
            onPress={() => router.push(`/(modals)/user/${member.userId}`)}
          >
            <Avatar uri={member.avatarUrl} name={member.displayName} size={32} />
            <Text style={styles.nearbyName} numberOfLines={1}>
              {member.displayName}
            </Text>
            <Text style={styles.nearbyDist}>{formatDistance(member.distance)}</Text>
          </Pressable>
        )
      )}
      {!showAllNearby && nearbyData.members.length > 5 && (
        <Pressable onPress={() => setShowAllNearby(true)}>
          <Text style={styles.nearbyExpand}>Pokaż w pobliżu ▾</Text>
        </Pressable>
      )}
      {showAllNearby && nearbyData.members.length > 5 && (
        <>
          {nearbyData.totalNearby > nearbyData.members.length && (
            <Text style={styles.nearbyNote}>
              {nearbyData.members.length} najbliższych z {nearbyData.totalNearby}
            </Text>
          )}
          <Pressable onPress={() => setShowAllNearby(false)}>
            <Text style={styles.nearbyExpand}>Zwiń ▴</Text>
          </Pressable>
        </>
      )}
    </View>
  </View>
)}
```

For **small groups (≤5 members)**, add inline distance badges on member rows instead:

```typescript
{/* Inline nearby badge for small groups */}
{sortedMembers.length <= 5 && nearbyData?.members && (() => {
  const nearbyMap = new Map(nearbyData.members.map(m => [m.userId, m.distance]));
  // Add nearbyDist to each member row
})()}
```

In the member row, after the role badge, conditionally render:

```typescript
{nearbyMap?.get(member.userId) != null && (
  <Text style={styles.memberNearbyBadge}>
    {formatDistance(nearbyMap.get(member.userId)!)}
  </Text>
)}
```

**Step 4: Add styles**

```typescript
nearbyTitle: {
  color: '#5B7A5E',
},
nearbyCard: {
  backgroundColor: '#EEF2EE',
  borderRadius: 10,
  padding: spacing.compact,
},
nearbyRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.tight,
  paddingVertical: spacing.tick,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: 'rgba(91, 122, 94, 0.1)',
},
nearbyName: {
  flex: 1,
  fontFamily: fonts.sans,
  fontSize: 14,
  color: colors.ink,
},
nearbyDist: {
  fontFamily: fonts.sansMedium,
  fontSize: 12,
  color: '#5B7A5E',
},
nearbyExpand: {
  fontFamily: fonts.sansMedium,
  fontSize: 12,
  color: '#5B7A5E',
  textAlign: 'center',
  paddingVertical: spacing.tight,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: 'rgba(91, 122, 94, 0.1)',
},
nearbyNote: {
  fontFamily: fonts.sans,
  fontSize: 10,
  color: colors.muted,
  textAlign: 'center',
  paddingTop: spacing.tick,
  fontStyle: 'italic',
},
memberNearbyBadge: {
  fontFamily: fonts.sansMedium,
  fontSize: 11,
  color: '#5B7A5E',
},
```

**Step 5: Import `formatDistance`**

```typescript
import { formatDistance } from '../../../src/lib/format';
```

**Step 6: Commit**

```
git add apps/mobile/app/(modals)/group/[id].tsx
git commit -m "Add nearby members section to group detail screen (BLI-7)"
```

---

### Task 10: Mobile — location visibility toggle on group detail

**Files:**
- Modify: `apps/mobile/app/(modals)/group/[id].tsx`

**Step 1: Add toggle state and mutation**

```typescript
const [locationVisible, setLocationVisible] = useState(
  groupInfo?.locationVisible ?? true
);

const setVisibility = trpc.groups.setLocationVisibility.useMutation({
  onSuccess: () => {
    utils.groups.getNearbyMembers.invalidate({ conversationId: conversationId! });
  },
});
```

Sync state when `groupInfo` loads:

```typescript
useEffect(() => {
  if (groupInfo?.locationVisible != null) {
    setLocationVisible(groupInfo.locationVisible);
  }
}, [groupInfo?.locationVisible]);
```

**Step 2: Add Switch UI in actions section**

Import `Switch` from `react-native`. Between "Link zaproszenia" and "Opuść grupę":

```typescript
<View style={styles.toggleRow}>
  <View>
    <Text style={styles.actionText}>Pokaż moją lokalizację</Text>
    <Text style={styles.toggleDesc}>
      Inni członkowie zobaczą, że jesteś w pobliżu
    </Text>
  </View>
  <Switch
    value={locationVisible}
    onValueChange={(value) => {
      setLocationVisible(value);
      setVisibility.mutate({
        conversationId: conversationId!,
        visible: value,
      });
    }}
    trackColor={{ false: colors.rule, true: '#4cd964' }}
  />
</View>
```

**Step 3: Add styles**

```typescript
toggleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: 14,
  borderBottomWidth: 1,
  borderBottomColor: colors.rule,
  gap: spacing.gutter,
},
toggleDesc: {
  fontFamily: fonts.sans,
  fontSize: 12,
  color: colors.muted,
  marginTop: 2,
},
```

**Step 4: Commit**

```
git add apps/mobile/app/(modals)/group/[id].tsx
git commit -m "Add location visibility toggle to group detail (BLI-7)"
```

---

### Task 11: Mobile — separate members list screen

**Files:**
- Create: `apps/mobile/app/(modals)/group/members/[id].tsx`

**Step 1: Create the screen**

Full-screen FlatList with paginated `getMembers`, search bar for >50 members.

```typescript
import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { trpc } from '../../../../src/lib/trpc';
import { Avatar } from '../../../../src/components/ui/Avatar';
import { colors, fonts, spacing } from '../../../../src/theme';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Właściciel',
  admin: 'Admin',
};

const PAGE_SIZE = 50;

export default function GroupMembersScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const [cursor, setCursor] = useState(0);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const { data: groupInfo } = trpc.groups.getGroupInfo.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId },
  );

  const { isLoading } = trpc.groups.getMembers.useQuery(
    { conversationId: conversationId!, limit: PAGE_SIZE, cursor },
    {
      enabled: !!conversationId,
      onSuccess: (data) => {
        if (cursor === 0) {
          setAllMembers(data);
        } else {
          setAllMembers((prev) => [...prev, ...data]);
        }
        if (data.length < PAGE_SIZE) setHasMore(false);
      },
    },
  );

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      setCursor(allMembers.length);
    }
  }, [hasMore, isLoading, allMembers.length]);

  const memberCount = groupInfo?.memberCount ?? allMembers.length;

  return (
    <>
      <Stack.Screen options={{ title: `Członkowie (${memberCount})` }} />
      <FlatList
        style={styles.container}
        data={allMembers}
        keyExtractor={(item) => item.userId}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <Pressable
            style={styles.memberRow}
            onPress={() => router.push(`/(modals)/user/${item.userId}`)}
          >
            <Avatar uri={item.avatarUrl} name={item.displayName} size={36} />
            <Text style={styles.memberName} numberOfLines={1}>
              {item.displayName}
            </Text>
            {ROLE_LABELS[item.role] ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{ROLE_LABELS[item.role]}</Text>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.compact,
    paddingHorizontal: spacing.section,
    gap: spacing.gutter,
  },
  memberName: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  roleBadge: {
    backgroundColor: colors.rule,
    paddingHorizontal: spacing.tight,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
```

**Step 2: Update group detail to link to members screen**

In `apps/mobile/app/(modals)/group/[id].tsx`, replace the "Pokaż wszystkich" Pressable with navigation:

```typescript
<Pressable
  style={styles.showAllBtn}
  onPress={() => router.push(`/(modals)/group/members/${conversationId}`)}
>
  <Text style={styles.showAllText}>
    Pokaż wszystkich ({sortedMembers.length}) →
  </Text>
</Pressable>
```

Always show this link when there are more than 5 members (remove the `hasMoreMembers && !showAllMembers` condition — the inline expand is no longer needed).

**Step 3: Commit**

```
git add apps/mobile/app/(modals)/group/members/[id].tsx apps/mobile/app/(modals)/group/[id].tsx
git commit -m "Add separate members list screen with pagination (BLI-7)"
```

---

### Task 12: Non-member view — nearby section

**Files:**
- Modify: `apps/mobile/app/(modals)/group/[id].tsx`

**Step 1: Add nearby section to non-member view**

In the non-member return block (inside `if (!isMember) { return (...) }`), add the nearby section between the member count and the join button:

```typescript
{nearbyData && nearbyData.totalNearby > 0 && (
  <View style={styles.nearbySection}>
    <Text style={[styles.sectionTitle, styles.nearbyTitle]}>
      W pobliżu ({nearbyData.totalNearby})
    </Text>
    <View style={styles.nearbyCard}>
      {nearbyData.members.slice(0, 5).map((member) => (
        <View key={member.userId} style={styles.nearbyRow}>
          <Avatar uri={member.avatarUrl} name={member.displayName} size={32} />
          <Text style={styles.nearbyName} numberOfLines={1}>
            {member.displayName}
          </Text>
          <Text style={styles.nearbyDist}>{formatDistance(member.distance)}</Text>
        </View>
      ))}
    </View>
  </View>
)}
```

The `nearbyData` query is already enabled regardless of membership (no `isMember` check in the query enable condition), so this will work for non-members of discoverable groups.

**Step 2: Commit**

```
git add apps/mobile/app/(modals)/group/[id].tsx
git commit -m "Show nearby members for non-member group preview (BLI-7)"
```

---

### Task 13: Typecheck and verify

**Step 1: Run typechecks**

```bash
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
cd apps/mobile && npx tsc --noEmit
```

Fix any type errors.

**Step 2: Manual verification**

1. Start API: `cd apps/api && pnpm dev`
2. Start mobile: `cd apps/mobile && npx expo start`
3. Verify:
   - "W okolicy" screen: group markers on map (rounded squares with green badge)
   - GroupRow: "X osób w pobliżu" text
   - Tap group → nearby section with distances
   - Toggle "Pokaż moją lokalizację" off → refresh → no longer in others' nearby
   - "Pokaż wszystkich →" → separate screen with FlatList
   - Non-member view: nearby members + Dołącz button
   - Filter chips: Wszystko (people + groups on map), Grupy (only groups), Osoby (only people)

**Step 3: Final commit**

```
git add -A
git commit -m "Fix typecheck issues for nearby group members (BLI-7)"
```
