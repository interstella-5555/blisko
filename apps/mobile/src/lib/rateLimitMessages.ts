const RATE_LIMIT_MESSAGES: Record<string, string> = {
  "waves.send": "Wysłałeś dużo zaczepek. Odpocznij chwilę i spróbuj później.",
  "messages.send": "Za dużo wiadomości naraz. Zwolnij trochę.",
  "messages.sendGlobal": "Za dużo wiadomości. Spróbuj ponownie za chwilę.",
  "profiles.update": "Za dużo zmian w profilu. Spróbuj ponownie za chwilę.",
  uploads: "Za dużo przesłanych plików. Spróbuj ponownie za chwilę.",
  dataExport: "Eksport danych jest dostępny raz na 24 godziny.",
  "auth.otpRequest": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
  "auth.otpVerify": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
};

const DEFAULT_MESSAGE = "Zbyt wiele prób. Spróbuj ponownie za chwilę.";

export function getRateLimitMessage(context?: string): string {
  return (context && RATE_LIMIT_MESSAGES[context]) || DEFAULT_MESSAGE;
}
