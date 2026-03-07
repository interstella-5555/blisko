# Account Deletion — Design

## Overview

GDPR-compliant account deletion with 14-day soft delete grace period before permanent hard delete. OTP verification required before deletion.

## User Flow

### Deletion
1. Ustawienia > Konto > "Usun konto"
2. Alert: "Czy na pewno chcesz trwale usunac swoje konto? Tej operacji nie mozna cofnac."
3. User taps "Kontynuuj" > OTP sent to email
4. User enters OTP code (reuse existing verify flow)
5. After OTP verification: soft delete + logout + redirect to login screen

### Login attempt during grace period
- User tries to log in with soft-deleted email
- Error alert: "Twoje konto jest w trakcie usuwania. Moze to potrwac do 14 dni."
- No restore option in UI. Admin can manually restore via DB if contacted by user.

### After 14 days
- BullMQ delayed job fires hard delete
- All user data permanently removed (DB rows, S3 files)
- Email becomes available for new registration

## Backend

### Database changes
- Add `deletedAt` column (timestamp, nullable) to `user` table

### New tRPC procedures
- `accounts.requestDeletion` — verifies OTP, sets `deletedAt = now()`, deletes all sessions, removes push tokens, schedules hard delete BullMQ job with 14-day delay

### Login check
- After successful auth, check `deletedAt` on user — if set, destroy the new session and return error

### Hard delete job (BullMQ, 14-day delay)
Deletion order:
1. S3 files — extract keys from `profiles.avatarUrl` and `profiles.portrait`, delete from Tigris
2. Non-cascading tables:
   - `connectionAnalyses` (fromUserId, toUserId)
   - `statusMatches` (userId, matchedUserId)
   - `blocks` (blockerId, blockedId)
   - `pushTokens` (userId)
   - `messageReactions` (via messages.senderId)
   - `messages` (senderId)
   - `conversationParticipants` (userId)
   - `waves` (fromUserId, toUserId)
   - `conversations` (creatorId — set null or delete if no other participants)
   - `topics` (creatorId — set null)
3. Delete `user` row — cascades to: sessions, accounts, profiles, profilingSessions

### Filtering
- Nearby query: filter `WHERE deletedAt IS NULL`
- Conversations: filter out conversations where the other participant has `deletedAt` set

## Mobile

### account.tsx changes
- Replace TODO in `handleDeleteAccount` with:
  1. Send OTP via `authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })`
  2. Navigate to OTP verification screen
  3. On OTP success: call `trpc.accounts.requestDeletion.mutate({ otp })`
  4. On success: `useAuthStore.getState().reset()` + navigate to login

### No new screens needed
- Reuse existing OTP verification flow
- Error alert on login attempt handled in auth flow (no dedicated screen)

## Data visibility during grace period

- Soft-deleted user immediately invisible to others
- Their conversations hidden from other participants
- Their waves hidden
- They don't appear in nearby
- All data preserved in DB for potential admin restore
- After hard delete: everything gone permanently

## Out of scope

- User-facing restore flow (admin-only via DB)
- Immediate hard delete option
- Data export before deletion
