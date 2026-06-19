interface StatusFields {
  currentStatus: string | null;
}

export function isStatusActive(profile: StatusFields): boolean {
  return !!profile.currentStatus;
}
