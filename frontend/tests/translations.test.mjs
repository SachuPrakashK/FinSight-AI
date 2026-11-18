import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const localeDirectory = join(dirname(fileURLToPath(import.meta.url)), "../src/i18n/locales");
const localeCodes = ["en", "hi", "ml", "ta"];

async function loadLocale(language) {
  const content = await readFile(join(localeDirectory, `${language}.json`), "utf8");
  return JSON.parse(content);
}

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? flattenKeys(child, fullKey) : [fullKey];
  });
}

test("all supported translations provide the same keys as English", async () => {
  const english = flattenKeys(await loadLocale("en")).sort();

  for (const language of localeCodes.slice(1)) {
    assert.deepEqual(flattenKeys(await loadLocale(language)).sort(), english, language);
  }
});

test("translated labels are populated for every supported language", async () => {
  for (const language of localeCodes) {
    const locale = await loadLocale(language);
    const keys = flattenKeys(locale);
    const values = keys.map((key) => key.split(".").reduce((value, part) => value[part], locale));

    assert.ok(
      values.every((value) => typeof value === "string" && value.trim().length > 0),
      language,
    );
  }
});
