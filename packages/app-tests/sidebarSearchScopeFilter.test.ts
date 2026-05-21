import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import test from "node:test";

const source = readFileSync("apps/desktop/src/components/sidebar/ConnectionTree.vue", "utf8");

test("connection tree exposes node search scopes instead of driver profile filters", () => {
  assert.match(source, /type SearchScope = "connection" \| "database" \| "schema" \| "table" \| "view"/);
  assert.match(source, /const selectedSearchScopes = ref<SearchScope\[]>\(\[\]\)/);
  assert.match(source, /filterSidebarTree\(nodes, q, searchCollapsedIds\.value, searchableNodeTypes\.value\)/);
});

test("connection tree filter menu uses sidebar search scope i18n labels", () => {
  assert.match(source, /t\("sidebar\.searchScopeConnection"\)/);
  assert.match(source, /t\("sidebar\.searchScopeDatabase"\)/);
  assert.match(source, /t\("sidebar\.searchScopeTable"\)/);
});
