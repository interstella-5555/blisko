import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock the Lingui macros so the test doesn't need the babel transform pipeline.
// `t` returns the source PL template with interpolation; `plural` picks the
// appropriate form for Polish (1 = one, 2-4 = few, else many).
vi.mock("@lingui/core/macro", () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof strings === "string") return strings;
    let out = "";
    strings.forEach((part, i) => {
      out += part;
      if (i < values.length) out += String(values[i]);
    });
    return out;
  },
  plural: (count: number, forms: { one?: string; few?: string; many?: string; other: string }) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    let key: "one" | "few" | "many" | "other";
    if (count === 1) key = "one";
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) key = "few";
    else key = "many";
    const tpl = forms[key] ?? forms.other;
    return tpl.replace("#", String(count));
  },
}));

import { formatLastActive } from "../src/lib/format";

const FIXED_NOW = new Date("2026-05-24T15:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function minutesAgo(min: number): Date {
  return new Date(FIXED_NOW - min * 60_000);
}

function hoursAgo(h: number): Date {
  return new Date(FIXED_NOW - h * 60 * 60_000);
}

function daysAgo(d: number): Date {
  return new Date(FIXED_NOW - d * 24 * 60 * 60_000);
}

describe("formatLastActive", () => {
  test("returns empty string for null / undefined", () => {
    expect(formatLastActive(null)).toBe("");
    expect(formatLastActive(undefined)).toBe("");
  });

  test('"teraz" below 5-minute fresh window', () => {
    expect(formatLastActive(minutesAgo(0))).toBe("teraz");
    expect(formatLastActive(minutesAgo(1))).toBe("teraz");
    expect(formatLastActive(minutesAgo(4))).toBe("teraz");
  });

  test('5-minute boundary flips to "X min temu"', () => {
    expect(formatLastActive(minutesAgo(5))).toBe("5 min temu");
    expect(formatLastActive(minutesAgo(15))).toBe("15 min temu");
    expect(formatLastActive(minutesAgo(59))).toBe("59 min temu");
  });

  test('60-minute boundary flips to "X godz. temu"', () => {
    expect(formatLastActive(hoursAgo(1))).toBe("1 godz. temu");
    expect(formatLastActive(hoursAgo(2))).toBe("2 godz. temu");
    expect(formatLastActive(hoursAgo(23))).toBe("23 godz. temu");
  });

  test('24-hour boundary flips to "wczoraj"', () => {
    expect(formatLastActive(hoursAgo(24))).toBe("wczoraj");
    expect(formatLastActive(hoursAgo(47))).toBe("wczoraj");
  });

  test('48-hour boundary flips to "X dni temu" with plural', () => {
    expect(formatLastActive(daysAgo(2))).toBe("2 dni temu");
    expect(formatLastActive(daysAgo(3))).toBe("3 dni temu");
    expect(formatLastActive(daysAgo(4))).toBe("4 dni temu");
    expect(formatLastActive(daysAgo(5))).toBe("5 dni temu");
    expect(formatLastActive(daysAgo(6))).toBe("6 dni temu");
  });

  test('7-day boundary flips to "dawno temu"', () => {
    expect(formatLastActive(daysAgo(7))).toBe("dawno temu");
    expect(formatLastActive(daysAgo(30))).toBe("dawno temu");
  });

  test("accepts ISO string in addition to Date", () => {
    expect(formatLastActive(minutesAgo(10).toISOString())).toBe("10 min temu");
  });

  test("future timestamp treated as 'teraz' (clock skew safety)", () => {
    expect(formatLastActive(new Date(FIXED_NOW + 60_000))).toBe("teraz");
  });
});
