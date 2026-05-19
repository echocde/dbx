import test from "node:test";
import assert from "node:assert/strict";
import {
  RESULT_PAGE_SIZE_OPTIONS,
  normalizeResultPageSize,
  resultPageSizeMenuOptions,
} from "../../apps/desktop/src/lib/paginationPageSize.ts";
import { readFileSync } from "node:fs";

test("normalizes query result page sizes into a safe range", () => {
  assert.equal(normalizeResultPageSize(undefined), 100);
  assert.equal(normalizeResultPageSize(0), 100);
  assert.equal(normalizeResultPageSize(-5), 100);
  assert.equal(normalizeResultPageSize(42.8), 42);
  assert.equal(normalizeResultPageSize(200000), 100000);
});

test("query result page size menu includes the current custom value", () => {
  assert.deepEqual(RESULT_PAGE_SIZE_OPTIONS, [50, 100, 500, 1000]);
  assert.deepEqual(resultPageSizeMenuOptions(5000), [50, 100, 500, 1000, 5000]);
  assert.deepEqual(resultPageSizeMenuOptions(100), [50, 100, 500, 1000]);
});

test("data grid page size menu exposes a custom input", () => {
  const source = readFileSync("apps/desktop/src/components/grid/DataGrid.vue", "utf8");

  assert.match(source, /customPageSizeInput/);
  assert.match(source, /settingsStore\.updateEditorSettings\(\{ pageSize: normalizedSize \}\)/);
  assert.match(source, /t\("grid\.customRowsPerPage"\)/);
});
