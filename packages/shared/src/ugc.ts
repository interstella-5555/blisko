// UGC fields that get on-demand translation across locales (BLI-279). Lives in
// @repo/shared so both API (drizzle schema, services) and mobile (display
// components, store) can import without pulling drizzle into the mobile bundle.
//
// snake_case here matches the `profile_translations.field` column values in
// Postgres — keep them aligned so we don't need a translation layer.

export const UGC_TRANSLATABLE_FIELDS = ["bio", "looking_for", "portrait", "current_status", "bio_essence"] as const;
export type UgcTranslatableField = (typeof UGC_TRANSLATABLE_FIELDS)[number];

// Subset shown with the on-demand "Przetłumacz" / "Pokaż oryginał" affordance on
// the profile detail screen. Excludes `bio_essence` — that field is resolved to
// the viewer's locale server-side in the nearby list and never rendered via
// TranslatableText / the `translateContent` mutation. BLI-304.
export const VIEWER_TRANSLATABLE_FIELDS = ["bio", "looking_for", "portrait", "current_status"] as const;
export type ViewerTranslatableField = (typeof VIEWER_TRANSLATABLE_FIELDS)[number];
