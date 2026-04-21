import { resolveAvatarUri } from "~/lib/avatar";

export function UserCell({
  displayName,
  avatarUrl,
  email,
  muted = false,
}: {
  displayName: string | null;
  avatarUrl: string | null;
  email: string;
  muted?: boolean;
}) {
  const name = displayName ?? email;
  const resolvedUri = resolveAvatarUri(avatarUrl, 32);
  return (
    <div className={`flex items-center gap-3 ${muted ? "opacity-50" : ""}`}>
      {resolvedUri ? (
        <img src={resolvedUri} alt="" className="size-8 rounded-full object-cover" />
      ) : (
        <div className="flex size-8 items-center justify-center rounded-full bg-muted font-medium text-xs">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <span className="block truncate font-medium text-sm">{name}</span>
        <span className="block truncate text-muted-foreground text-xs">{email}</span>
      </div>
    </div>
  );
}
