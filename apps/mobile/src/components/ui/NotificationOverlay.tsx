import { useNotification } from "../../providers/NotificationProvider";
import { NotificationBanner } from "./NotificationBanner";

export function NotificationOverlay() {
  const { current, handlePress, handleDismiss } = useNotification();

  if (!current) return null;

  return (
    <NotificationBanner
      visible
      title={current.title}
      subtitle={current.subtitle}
      avatarUrl={current.avatarUrl}
      avatarName={current.avatarName}
      onPress={handlePress}
      onDismiss={handleDismiss}
    />
  );
}
