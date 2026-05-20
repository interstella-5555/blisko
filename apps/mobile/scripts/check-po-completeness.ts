#!/usr/bin/env bun
/**
 * CI check: every msgid in `src/locales/pl/messages.po` must have a
 * non-empty `msgstr` in `src/locales/uk/messages.po`. Fails with the list
 * of missing translations so the dev can run `bun run i18n:translate` to
 * fill them. See docs/architecture/i18n.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as gettextParser from "gettext-parser";

const PL_PATH = resolve(import.meta.dir, "../src/locales/pl/messages.po");
const UK_PATH = resolve(import.meta.dir, "../src/locales/uk/messages.po");

const plCatalog = gettextParser.po.parse(readFileSync(PL_PATH));
const ukCatalog = gettextParser.po.parse(readFileSync(UK_PATH));

const plMessages = plCatalog.translations[""] ?? {};
const ukMessages = ukCatalog.translations[""] ?? {};

const missing: string[] = [];
for (const msgid of Object.keys(plMessages)) {
  if (msgid === "") continue; // header
  const ukTranslation = ukMessages[msgid]?.msgstr?.[0] ?? "";
  if (!ukTranslation) missing.push(msgid);
}

if (missing.length === 0) {
  console.log("✓ UA catalog complete — all PL msgids translated.");
  process.exit(0);
}

console.error(`✗ UA catalog incomplete — ${missing.length} msgid(s) missing translation:`);
for (const msgid of missing) {
  console.error(`  - ${JSON.stringify(msgid)}`);
}
console.error("\nRun `bun run mobile:i18n:translate` to fill them via OpenAI.");
process.exit(1);
