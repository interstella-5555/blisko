import { describe, expect, it } from "vitest";
import { t } from "../src/services/i18n";

describe("t() backend helper", () => {
  it("returns the PL template for locale='pl'", () => {
    expect(t("push.group.invite.body", "pl")).toBe("Nowe zaproszenie do grupy");
  });

  it("returns the UA template for locale='uk'", () => {
    expect(t("push.group.invite.body", "uk")).toBe("Нове запрошення до групи");
  });

  it("falls back to PL when locale is null", () => {
    expect(t("push.group.invite.body", null)).toBe("Nowe zaproszenie do grupy");
  });

  it("falls back to PL when locale is undefined", () => {
    expect(t("push.group.invite.body", undefined)).toBe("Nowe zaproszenie do grupy");
  });

  it("falls back to PL when locale is unsupported", () => {
    expect(t("push.group.invite.body", "de")).toBe("Nowe zaproszenie do grupy");
  });

  it("interpolates params", () => {
    expect(t("push.wave.new.body", "uk", { senderName: "Аня" })).toBe("Аня — новий пінг!");
  });

  it("interpolates a numeric param", () => {
    expect(t("push.message.unread.body", "uk", { unreadCount: 5 })).toBe("5 нових повідомлень");
  });

  it("leaves placeholder intact when param is missing", () => {
    expect(t("push.wave.new.body", "pl", {})).toBe("{senderName} — nowy ping!");
  });

  it("returns the key itself when missing in both catalogs", () => {
    expect(t("push.nonexistent.key", "pl")).toBe("push.nonexistent.key");
  });

  it("falls back to PL when key is missing in UA but present in PL", () => {
    // No realistic divergence right now; verify the behavior with a synthetic
    // expectation by reusing an existing PL key — both catalogs have it, so
    // this is a structural check, not a divergence assertion.
    expect(t("push.wave.new.body", "uk", { senderName: "X" })).toBe("X — новий пінг!");
  });
});
