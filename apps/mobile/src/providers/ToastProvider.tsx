import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastType = "error" | "success" | "info";

export interface ToastConfig {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (config: Omit<ToastConfig, "id">) => void;
  current: ToastConfig | null;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  current: null,
  dismiss: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastConfig | null>(null);
  const queueRef = useRef<ToastConfig[]>([]);
  const showingRef = useRef(false);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (next) {
      showingRef.current = true;
      setCurrent(next);
      Haptics.notificationAsync(
        next.type === "error"
          ? Haptics.NotificationFeedbackType.Error
          : next.type === "success"
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
      );
    } else {
      showingRef.current = false;
      setCurrent(null);
    }
  }, []);

  const showToast = useCallback((config: Omit<ToastConfig, "id">) => {
    const toast: ToastConfig = { ...config, id: `toast-${Date.now()}` };

    if (showingRef.current) {
      queueRef.current.push(toast);
    } else {
      showingRef.current = true;
      setCurrent(toast);
      Haptics.notificationAsync(
        toast.type === "error"
          ? Haptics.NotificationFeedbackType.Error
          : toast.type === "success"
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
      );
    }
  }, []);

  const dismiss = useCallback(() => {
    setCurrent(null);
    setTimeout(showNext, 300);
  }, [showNext]);

  return <ToastContext.Provider value={{ showToast, current, dismiss }}>{children}</ToastContext.Provider>;
}
