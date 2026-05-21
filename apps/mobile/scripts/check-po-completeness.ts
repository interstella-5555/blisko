#!/usr/bin/env bun
/**
 * CI check: every msgid in `src/locales/pl/messages.po` must have a
 * non-empty `msgstr` in `src/locales/ua/messages.po`. Fails with the list
 * of missing translations so the dev can run `bun run i18n:translate` to
 * fill them. See docs/architecture/i18n.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as gettextParser from "gettext-parser";

const PL_PATH = resolve(import.meta.dir, "../src/locales/pl/messages.po");
const UA_PATH = resolve(import.meta.dir, "../src/locales/ua/messages.po");

const plCatalog = gettextParser.po.parse(readFileSync(PL_PATH));
const uaCatalog = gettextParser.po.parse(readFileSync(UA_PATH));

const plMessages = plCatalog.translations[""] ?? {};
const uaMessages = uaCatalog.translations[""] ?? {};

const missing: string[] = [];
for (const msgid of Object.keys(plMessages)) {
  if (msgid === "") continue; // header
  const uaTranslation = uaMessages[msgid]?.msgstr?.[0] ?? "";
  if (!uaTranslation) missing.push(msgid);
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
