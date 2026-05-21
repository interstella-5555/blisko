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

  it("returns PL translation when contentLocale === uk", () => {
    const ukProfile: ProfileLocaleSlice = {
      contentLocale: "uk",
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

    expect(getCanonicalText(ukProfile, "bio", translations)).toBe("Cześć, lubię kawę.");
    expect(getCanonicalText(ukProfile, "looking_for", translations)).toBe("Szukam rozmówcy.");
    expect(getCanonicalText(ukProfile, "portrait", translations)).toBe("Ciepła osoba.");
    expect(getCanonicalText(ukProfile, "current_status", translations)).toBe("Pracuję w kawiarni.");
  });

  it("falls back to UK original when PL translation row is missing", () => {
    const ukProfile: ProfileLocaleSlice = {
      contentLocale: "uk",
      bio: "Привіт",
      lookingFor: null,
      portrait: null,
      currentStatus: null,
    };
    expect(getCanonicalText(ukProfile, "bio", [])).toBe("Привіт");
  });

  it("ignores translation rows for the wrong field or locale", () => {
    const ukProfile: ProfileLocaleSlice = {
      contentLocale: "uk",
      bio: "Привіт",
      lookingFor: null,
      portrait: null,
      currentStatus: null,
    };
    const noisy: ProfileTranslationRow[] = [
      { field: "looking_for", locale: "pl", content: "wrong field" },
      { field: "bio", locale: "uk", content: "wrong locale" },
    ];
    expect(getCanonicalText(ukProfile, "bio", noisy)).toBe("Привіт");
  });
});
