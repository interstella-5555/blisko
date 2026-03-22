interface StatusFields {
  currentStatus: string | null;
  statusExpiresAt: Date | null;
}

interface VisibleStatusFields extends StatusFields {
  statusVisibility: "public" | "private" | null;
}

export function isStatusActive(profile: StatusFields): boolean {
  return !!profile.currentStatus && (!profile.statusExpiresAt || profile.statusExpiresAt > new Date());
}

export function isStatusPublic(profile: VisibleStatusFields): boolean {
  return isStatusActive(profile) && profile.statusVisibility !== "private";
}
