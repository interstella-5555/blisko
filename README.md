# Blisko

A mobile app for discovering and connecting with people who share your interests, right in your neighborhood.

<p align="center">
  <img src="docs/screens.png" alt="Login, OTP verification, and onboarding screens" width="680" />
</p>

**[Browse the Design Book →](https://design.meetapp.work)**

## Stack

- **Mobile:** Expo + React Native
- **Backend:** Hono + tRPC
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** Better Auth (magic link)

## Structure

```
apps/mobile      # iOS/Android app
apps/api         # Backend API
apps/design      # Design book
packages/shared  # Shared validators & types
```