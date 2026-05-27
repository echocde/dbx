import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/desktop/src/components/editor/QueryEditor.vue", "utf8");

test("query editor opens replace panel with Mod-H", () => {
  assert.match(source, /key:\s*"Mod-h"/);
  assert.match(source, /key:\s*"Ctrl-h"/);
  assert.match(source, /run:\s*openReplace/);
  assert.match(source, /showReplace\.value\s*=\s*true/);
  assert.match(source, /replaceInputRef\.value\?\.focus\(\)/);
});

test("query editor localizes the replace all button", () => {
  assert.match(source, /t\("editor\.search\.replaceAll"\)/);
  assert.doesNotMatch(source, />\s*全部\s*</);
});
