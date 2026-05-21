import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import test from "node:test";

const source = readFileSync("apps/desktop/src/components/grid/DataGrid.vue", "utf8");

test("data grid toolbar keeps a minimum content width", () => {
  assert.match(source, /class="data-grid-topbar flex items-stretch/);
  assert.match(source, /\.data-grid-topbar\s*\{\s*min-width: 760px;/s);
});
