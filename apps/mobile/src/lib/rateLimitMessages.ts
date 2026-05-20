import { t } from "@lingui/core/macro";

// Lingui macros must be invoked inside a function (not at module level), so
// the per-context lookup table is built lazily on each call. The cost is
// negligible — a handful of template-literal evaluations only when a request
// actually trips a rate limit.
export function getRateLimitMessage(context?: string): string {
  switch (context) {
    case "waves.send":
      return t`Wysłałeś dużo pingów. Odpocznij chwilę i spróbuj później.`;
    case "messages.send":
      return t`Za dużo wiadomości naraz. Zwolnij trochę.`;
    case "messages.sendGlobal":
      return t`Za dużo wiadomości. Spróbuj ponownie za chwilę.`;
    case "profiles.update":
      return t`Za dużo zmian w profilu. Spróbuj ponownie za chwilę.`;
    case "uploads":
      return t`Za dużo przesłanych plików. Spróbuj ponownie za chwilę.`;
    case "dataExport":
      return t`Eksport danych jest dostępny raz na 24 godziny.`;
    case "auth.otpRequest":
    case "auth.otpVerify":
      return t`Za dużo prób logowania. Spróbuj ponownie za kilka minut.`;
    default:
      return t`Zbyt wiele prób. Spróbuj ponownie za chwilę.`;
  }
}
