import { useToast } from "../../providers/ToastProvider";
import { ToastBanner } from "./ToastBanner";

export function ToastOverlay() {
  const { current, dismiss } = useToast();

  if (!current) return null;

  return (
    <ToastBanner visible type={current.type} title={current.title} message={current.message} onDismiss={dismiss} />
  );
}
