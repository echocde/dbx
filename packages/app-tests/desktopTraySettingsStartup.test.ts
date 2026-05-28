import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("app startup eagerly loads desktop settings so tray preference is not reset in the UI", () => {
  const source = readFileSync("apps/desktop/src/App.vue", "utf8");

  assert.match(source, /settingsStore\.initDesktopSettings\(\)\.catch\(\(\) => \{\}\);/);
});
