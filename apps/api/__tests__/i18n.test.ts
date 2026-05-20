import { describe, expect, it } from "vitest";
import { t } from "../src/services/i18n";

const inviteTranslations = {
  pl: "Nowe zaproszenie do grupy",
  uk: "Нове запрошення до групи",
};

describe("t() backend helper", () => {
  it("returns the PL string for locale='pl'", () => {
    expect(t("pl", inviteTranslations)).toBe("Nowe zaproszenie do grupy");
  });

  it("returns the UA string for locale='uk'", () => {
    expect(t("uk", inviteTranslations)).toBe("Нове запрошення до групи");
  });

  it("falls back to PL when locale is null", () => {
    expect(t(null, inviteTranslations)).toBe("Nowe zaproszenie do grupy");
  });

  it("falls back to PL when locale is undefined", () => {
    expect(t(undefined, inviteTranslations)).toBe("Nowe zaproszenie do grupy");
  });

  it("falls back to PL for an unsupported locale", () => {
    expect(t("de", inviteTranslations)).toBe("Nowe zaproszenie do grupy");
  });

  it("falls back to PL when the requested locale's translation is missing", () => {
    // Future-proofing: when a third locale is added to LocaleCode (e.g. "en"),
    // legacy callsites that haven't been updated to provide that translation
    // should not crash — they fall through to PL.
    expect(t("uk", { pl: "Tylko PL" })).toBe("Tylko PL");
  });

  it("interpolates via template literals at the callsite (no params API)", () => {
    const name = "Аня";
    expect(
      t("uk", {
        pl: `${name} — nowy ping!`,
        uk: `${name} — новий пінг!`,
      }),
    ).toBe("Аня — новий пінг!");
  });
});
