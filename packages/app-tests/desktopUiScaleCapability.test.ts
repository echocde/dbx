import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

test("desktop capability allows setting the webview zoom", () => {
  const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as {
    permissions: string[];
  };

  assert.equal(capability.permissions.includes("core:webview:allow-set-webview-zoom"), true);
});

test("app logs webview zoom failures instead of swallowing them silently", () => {
  const source = readFileSync("apps/desktop/src/App.vue", "utf8");

  assert.match(source, /getCurrentWebview\(\)\.setZoom\(scale\)/);
  assert.match(source, /console\.warn\("\[DBX\] Failed to apply UI scale"/);
  assert.match(source, /applyUiScale\(settingsStore\.editorSettings\.uiScale\)/);
});
