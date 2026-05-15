import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EDITOR_SETTINGS, normalizeEditorSettings } from "../src/stores/settingsStore.ts";

test("defaults Redis scan page size to 1000 keys", () => {
  assert.equal(DEFAULT_EDITOR_SETTINGS.redisScanPageSize, 1000);
  assert.equal(normalizeEditorSettings({}).redisScanPageSize, 1000);
});

test("keeps a saved Redis scan page size", () => {
  assert.equal(normalizeEditorSettings({ redisScanPageSize: 5000 }).redisScanPageSize, 5000);
});
