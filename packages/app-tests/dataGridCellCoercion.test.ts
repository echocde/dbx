import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
  coerceDataGridCellValue,
  dataGridCellDisplayText,
  dataGridCellEditorText,
} from "../../apps/desktop/src/lib/dataGridCellCoercion.ts";

test("formats Postgres array cells with native brace syntax", () => {
  const columnInfo = { data_type: "_text" };

  assert.equal(
    dataGridCellDisplayText({
      value: ["draft", "发布", "needs space"],
      databaseType: "postgres",
      columnInfo,
    }),
    '{draft,发布,"needs space"}',
  );
  assert.equal(
    dataGridCellEditorText({
      value: ["draft", "发布", "needs space"],
      databaseType: "postgres",
      columnInfo,
    }),
    '{draft,发布,"needs space"}',
  );
});

test("coerces JSON style input for Postgres array columns", () => {
  assert.deepEqual(
    coerceDataGridCellValue({
      value: `["draft","发布"]`,
      oldValue: "{legacy}",
      databaseType: "postgres",
      columnInfo: { data_type: "_text" },
    }),
    ["draft", "发布"],
  );
});
