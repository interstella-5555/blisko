interface StatusFields {
  currentStatus: string | null;
}

interface VisibleStatusFields extends StatusFields {
  statusVisibility: "public" | "private" | null;
}

export function isStatusActive(profile: StatusFields): boolean {
  return !!profile.currentStatus;
}

export function isStatusPublic(profile: VisibleStatusFields): boolean {
  return isStatusActive(profile) && profile.statusVisibility !== "private";
}
