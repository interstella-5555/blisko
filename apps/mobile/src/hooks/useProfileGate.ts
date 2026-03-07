import { useCallback, useState } from "react";
import { useAuthStore } from "../stores/authStore";

export function useProfileGate() {
  const isComplete = useAuthStore((s) => s.profile?.isComplete);
  const [sheetVisible, setSheetVisible] = useState(false);

  const requireFullProfile = useCallback(() => {
    if (isComplete) return true;
    setSheetVisible(true);
    return false;
  }, [isComplete]);

  return { requireFullProfile, sheetVisible, setSheetVisible };
}
