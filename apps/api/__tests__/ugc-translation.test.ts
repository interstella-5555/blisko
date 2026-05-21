import { describe, expect, it } from "vitest";
import {
  getCanonicalText,
  type ProfileLocaleSlice,
  type ProfileTranslationRow,
} from "../src/services/profile-translations";

describe("getCanonicalText", () => {
  const baseProfile: ProfileLocaleSlice = {
    contentLocale: "pl",
    bio: "Cześć, lubię kawę.",
    lookingFor: "Szukam kogoś do rozmowy.",
    portrait: "Ciepła osoba.",
    currentStatus: "Praca zdalna w kawiarni.",
  };

  it("returns the original when contentLocale === pl", () => {
    expect(getCanonicalText(baseProfile, "bio", [])).toBe("Cześć, lubię kawę.");
    expect(getCanonicalText(baseProfile, "looking_for", [])).toBe("Szukam kogoś do rozmowy.");
    expect(getCanonicalText(baseProfile, "portrait", [])).toBe("Ciepła osoba.");
    expect(getCanonicalText(baseProfile, "current_status", [])).toBe("Praca zdalna w kawiarni.");
  });

  it("returns PL translation when contentLocale === ua", () => {
    const uaProfile: ProfileLocaleSlice = {
      contentLocale: "ua",
      bio: "Привіт, люблю каву.",
      lookingFor: "Шукаю співрозмовника.",
      portrait: "Тепла людина.",
      currentStatus: "Працюю в кафе.",
    };
    const translations: ProfileTranslationRow[] = [
      { field: "bio", locale: "pl", content: "Cześć, lubię kawę." },
      { field: "looking_for", locale: "pl", content: "Szukam rozmówcy." },
      { field: "portrait", locale: "pl", content: "Ciepła osoba." },
      { field: "current_status", locale: "pl", content: "Pracuję w kawiarni." },
    ];

    expect(getCanonicalText(uaProfile, "bio", translations)).toBe("Cześć, lubię kawę.");
    expect(getCanonicalText(uaProfile, "looking_for", translations)).toBe("Szukam rozmówcy.");
    expect(getCanonicalText(uaProfile, "portrait", translations)).toBe("Ciepła osoba.");
    expect(getCanonicalText(uaProfile, "current_status", translations)).toBe("Pracuję w kawiarni.");
  });

  it("falls back to UA original when PL translation row is missing", () => {
    const uaProfile: ProfileLocaleSlice = {
      contentLocale: "ua",
      bio: "Привіт",
      lookingFor: null,
      portrait: null,
      currentStatus: null,
    };
    expect(getCanonicalText(uaProfile, "bio", [])).toBe("Привіт");
  });

  it("ignores translation rows for the wrong field or locale", () => {
    const uaProfile: ProfileLocaleSlice = {
      contentLocale: "ua",
      bio: "Привіт",
      lookingFor: null,
      portrait: null,
      currentStatus: null,
    };
    const noisy: ProfileTranslationRow[] = [
      { field: "looking_for", locale: "pl", content: "wrong field" },
      { field: "bio", locale: "ua", content: "wrong locale" },
    ];
    expect(getCanonicalText(uaProfile, "bio", noisy)).toBe("Привіт");
  });
});
