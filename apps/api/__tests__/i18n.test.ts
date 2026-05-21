import { describe, expect, it } from "vitest";
import { type BackendTranslationKey, t } from "../src/services/i18n";

describe("t() backend helper", () => {
  it("returns the PL template for locale='pl'", () => {
    expect(t("push.group.invite.body", "pl")).toBe("Nowe zaproszenie do grupy");
  });

  it("returns the UA template for locale='ua'", () => {
    expect(t("push.group.invite.body", "ua")).toBe("Нове запрошення до групи");
  });

  it("falls back to PL when locale is null", () => {
    expect(t("push.group.invite.body", null)).toBe("Nowe zaproszenie do grupy");
  });

  it("falls back to PL when locale is undefined", () => {
    expect(t("push.group.invite.body", undefined)).toBe("Nowe zaproszenie do grupy");
  });

  it("falls back to PL for an unsupported locale", () => {
    expect(t("push.group.invite.body", "de")).toBe("Nowe zaproszenie do grupy");
  });

  it("interpolates string params", () => {
    expect(t("push.wave.new.body", "ua", { senderName: "Аня" })).toBe("Аня — новий пінг!");
  });

  it("interpolates numeric params", () => {
    expect(t("push.message.unread.body", "ua", { unreadCount: 5 })).toBe("5 нових повідомлень");
  });

  it("leaves placeholder intact when a param is missing", () => {
    expect(t("push.wave.new.body", "pl", {})).toBe("{senderName} — nowy ping!");
  });

  it("looks up an email subject with an interpolated OTP", () => {
    expect(t("email.signIn.subject", "ua", { otp: "123456" })).toBe("123456 - Твій код до Blisko");
  });

  it("renders the localized layout footer", () => {
    expect(t("email.layout.footer", "ua")).toBe("З повагою,<br>Команда Blisko");
    expect(t("email.layout.footer", null)).toBe("Pozdrawiamy,<br>Zespół Blisko");
  });

  it("returns the key when caller passes an unknown key (defense-in-depth)", () => {
    // Cast simulates a runtime caller bypassing the BackendTranslationKey type.
    // Helper falls through to the key name so the bug surfaces visibly instead
    // of crashing inside a push handler.
    expect(t("push.nonexistent.key" as BackendTranslationKey, "pl")).toBe("push.nonexistent.key");
  });
});
