import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import test from "node:test";

const source = readFileSync("apps/desktop/src/components/grid/DataGrid.vue", "utf8");

test("toolbar refresh preserves header sort order", () => {
  const match = source.match(/async function onToolbarRefresh\(\) \{([\s\S]*?)\n\}/);
  assert.ok(match, "DataGrid should define onToolbarRefresh");
  assert.match(match[1], /currentOrderBy\(\)/);
  assert.doesNotMatch(match[1], /orderByInput\.value\.trim\(\) \|\| undefined/);
});

test("rollback refresh preserves header sort order", () => {
  const match = source.match(/function onToolbarRollback\(\) \{([\s\S]*?)\n\}/);
  assert.ok(match, "DataGrid should define onToolbarRollback");
  assert.match(match[1], /currentOrderBy\(\)/);
  assert.doesNotMatch(match[1], /orderByInput\.value\.trim\(\) \|\| undefined/);
});
