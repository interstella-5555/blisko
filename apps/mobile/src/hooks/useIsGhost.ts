import { useAuthStore } from "@/stores/authStore";

/** Returns true when the current user is a ghost (incomplete profile, ninja visibility). */
export function useIsGhost() {
  return useAuthStore((s) => s.profile?.isComplete === false);
}
