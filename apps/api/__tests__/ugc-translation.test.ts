import { describe, expect, it } from "vitest";
import {
  getCanonicalText,
  getViewerText,
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

describe("getViewerText", () => {
  const plProfile: ProfileLocaleSlice = {
    contentLocale: "pl",
    bioEssence: "Lubię kawę i długie spacery.",
    currentStatus: "Pracuję w kawiarni.",
  };

  it("returns the original when contentLocale === viewerLocale", () => {
    expect(getViewerText(plProfile, "bio_essence", [], "pl")).toBe("Lubię kawę i długie spacery.");
    expect(getViewerText(plProfile, "current_status", [], "pl")).toBe("Pracuję w kawiarni.");
  });

  it("returns the viewer-locale translation when contentLocale differs", () => {
    const translations: ProfileTranslationRow[] = [
      { field: "bio_essence", locale: "ua", content: "Люблю каву і довгі прогулянки." },
      { field: "current_status", locale: "ua", content: "Працюю в кафе." },
    ];
    expect(getViewerText(plProfile, "bio_essence", translations, "ua")).toBe("Люблю каву і довгі прогулянки.");
    expect(getViewerText(plProfile, "current_status", translations, "ua")).toBe("Працюю в кафе.");
  });

  it("falls back to the canonical original when no viewer-locale translation exists", () => {
    expect(getViewerText(plProfile, "bio_essence", [], "ua")).toBe("Lubię kawę i długie spacery.");
  });

  it("returns null when neither original nor translation is present", () => {
    const empty: ProfileLocaleSlice = { contentLocale: "pl", bioEssence: null };
    expect(getViewerText(empty, "bio_essence", [], "ua")).toBeNull();
  });
});
