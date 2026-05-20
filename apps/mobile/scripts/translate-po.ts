#!/usr/bin/env bun
/**
 * AI batch translator for Lingui PO files. Reads
 * `src/locales/pl/messages.po` (the source of truth) and
 * `src/locales/uk/messages.po` (existing UA translations). For each msgid
 * with an empty `msgstr` in UA, it calls OpenAI (`gpt-4o-mini`) to produce
 * a Ukrainian translation that preserves placeholders and tone.
 *
 * Idempotent: never overwrites a non-empty UA msgstr. Run after
 * `bun run i18n:extract` to fill in newly-extracted messages.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... bun run scripts/translate-po.ts
 *
 * `OPENAI_API_KEY` lives in `apps/api/.env` — Bun does not load that
 * automatically for this script, so set the env var in your shell or
 * symlink/copy the value before running. See docs/architecture/i18n.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as gettextParser from "gettext-parser";

const PL_PATH = resolve(import.meta.dir, "../src/locales/pl/messages.po");
const UK_PATH = resolve(import.meta.dir, "../src/locales/uk/messages.po");

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY is not set. Copy it from apps/api/.env or export it in your shell.");
  process.exit(1);
}

const plBuffer = readFileSync(PL_PATH);
const ukBuffer = readFileSync(UK_PATH);
const plCatalog = gettextParser.po.parse(plBuffer);
const ukCatalog = gettextParser.po.parse(ukBuffer);

// `translations[""]` is the contextless namespace where Lingui places every
// extracted message. Headers live there too under msgid "".
const plMessages = plCatalog.translations[""] ?? {};
const ukMessages = ukCatalog.translations[""] ?? {};

// Collect every msgid that needs a translation. Empty msgstr counts as
// missing; existing non-empty UA strings are preserved untouched.
const missing: string[] = [];
for (const msgid of Object.keys(plMessages)) {
  if (msgid === "") continue; // header
  const ukExisting = ukMessages[msgid]?.msgstr?.[0] ?? "";
  if (!ukExisting) missing.push(msgid);
}

if (missing.length === 0) {
  console.log("Nothing to translate — UA catalog is already complete.");
  process.exit(0);
}

console.log(`Translating ${missing.length} msgids → UA via gpt-4o-mini...`);

const SYSTEM_PROMPT = `You translate Polish UI strings into Ukrainian for a social mobile app called Blisko (friendly social-proximity app for young people in Warsaw). Rules:

1. Preserve ALL placeholders exactly — \`{0}\`, \`{name}\`, \`{count}\`, etc. — do not translate the contents inside braces.
2. Preserve formatting characters like \\n, ellipsis ..., punctuation.
3. Tone: informal, friendly, modern Ukrainian. Use "ти" form (familiar). Avoid stiff bureaucratic language.
4. Keep the meaning faithful. If the Polish is short and punchy, keep the Ukrainian short and punchy.
5. Brand name "Blisko" / "BLISKO" stays as-is (it's a proper noun).
6. Email addresses (kontakt@blisko.app) and URLs stay as-is.

Output ONLY a JSON object mapping each input msgid to its Ukrainian translation. No commentary, no markdown fences. Format: \`{ "msgid here": "переклад тут", ... }\`.`;

const BATCH_SIZE = 30;

async function translateBatch(batch: string[]): Promise<Record<string, string>> {
  const userPrompt = `Translate these Polish strings to Ukrainian. Return ONLY a JSON object with the same keys:\n\n${JSON.stringify(batch, null, 2)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${errBody}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  const parsed = JSON.parse(content) as Record<string, string>;
  return parsed;
}

const translations: Record<string, string> = {};
for (let i = 0; i < missing.length; i += BATCH_SIZE) {
  const batch = missing.slice(i, i + BATCH_SIZE);
  process.stdout.write(`  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missing.length / BATCH_SIZE)}... `);
  const result = await translateBatch(batch);
  Object.assign(translations, result);
  console.log(`✓ ${Object.keys(result).length} translated`);
}

// Patch the UA catalog in place. Lingui's gettext-parser representation keeps
// each entry as { msgid, msgstr, comments?, references? } — we want to
// preserve the source-reference comments from the PL catalog so context
// stays visible to reviewers.
for (const msgid of missing) {
  const translation = translations[msgid];
  if (!translation) {
    console.warn(`  warn: missing translation for "${msgid}"`);
    continue;
  }
  const existing = ukMessages[msgid] ?? plMessages[msgid];
  ukMessages[msgid] = {
    ...existing,
    msgid,
    msgstr: [translation],
  };
}

ukCatalog.translations[""] = ukMessages;

const output = gettextParser.po.compile(ukCatalog);
writeFileSync(UK_PATH, output);

console.log(`\nDone. ${missing.length} translations written to ${UK_PATH}`);
console.log("Review the diff with `git diff apps/mobile/src/locales/uk/messages.po` before committing.");
