import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/desktop/src/components/grid/DataGrid.vue", "utf8");

test("data grid memoizes virtual rows with render-affecting dependencies", () => {
  assert.match(source, /function rowRenderMemoDeps\(item: RowItem, index: number\)/);
  assert.match(source, /function rowSelectionMemoKey\(item: RowItem, index: number\)/);
  assert.match(source, /function rowSearchMemoKey\(index: number\)/);
  assert.match(source, /function rowHoverMemoKey\(index: number\)/);
  assert.match(source, /const columnFormatterMemoKey = computed/);
  assert.match(source, /v-memo="rowRenderMemoDeps\(item, index\)"/);
});
