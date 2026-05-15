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

test("defaults shortcut settings", () => {
  const settings = normalizeEditorSettings({});

  assert.equal(settings.shortcuts.executeSql, "Mod+Enter");
  assert.equal(settings.shortcuts.saveSql, "Mod+S");
  assert.equal(settings.shortcuts.focusSearch, "Mod+F");
});

test("keeps saved shortcut overrides", () => {
  const settings = normalizeEditorSettings({ shortcuts: { executeSql: "Shift+Mod+Enter" } as any });

  assert.equal(settings.shortcuts.executeSql, "Shift+Mod+Enter");
  assert.equal(settings.shortcuts.saveSql, "Mod+S");
});
