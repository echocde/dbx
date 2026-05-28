import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../apps/desktop/src/components/grid/DataGrid.vue", import.meta.url), "utf8");
const selectionSource = readFileSync(
  new URL("../../apps/desktop/src/composables/useDataGridSelection.ts", import.meta.url),
  "utf8",
);

test("data grid wires whole table, row, and column selection gestures", () => {
  assert.match(source, /@click="selectAllCells"/);
  assert.match(source, /@click="selectColumn\(colIdx, \$event\)"/);
  assert.match(source, /columnIsSelected\(colIdx\)/);
  assert.match(selectionSource, /function selectAllCells\(\)/);
  assert.match(selectionSource, /function selectColumn\(colIndex: number, event\?: MouseEvent\)/);
  assert.match(selectionSource, /lastClickedColumnIndex/);
  assert.match(selectionSource, /selectedColumnIndexes/);
  assert.match(selectionSource, /event\?\.metaKey \|\| event\?\.ctrlKey/);
  assert.match(selectionSource, /next\.has\(colIndex\)/);
  assert.match(selectionSource, /clearCellSelection\(\);\s+selectSingleCell\(rowIndex, colIndex\);/);
  assert.match(selectionSource, /if \(hasColumnSelection\.value\) clearCellSelection\(\);/);
});

test("data grid intercepts copy and select-all shortcuts for grid selections", () => {
  assert.match(source, /clipboardShortcut\(event, "a"\)/);
  assert.match(source, /selectAllCells\(\)/);
  assert.match(source, /isTransposeMode\.value && hasRowSelection\.value/);
  assert.match(source, /copyRow\(\);/);
  assert.match(source, /if \(hasCellSelection\.value\) \{\s+copySelectionTsv\(\);/);
  assert.match(source, /copySelectedRowsTsv\(\)/);
});

test("row number multi-selection reuses cell selection visuals", () => {
  assert.match(source, /function rowCellsUseSelectionVisual\(rowId: number\): boolean/);
  assert.match(source, /hasRowSelection\.value && isRowSelected\(rowId\) && !hasCellSelection\.value/);
  assert.match(source, /'row-cell-selected':/);
  assert.match(source, /'row-cell-selected-dirty':/);
  assert.match(source, /\.row-cell-selected \{/);
  assert.match(source, /\.row-cell-selected-dirty \{/);
});

test("transpose cells reuse grid cell selection and details", () => {
  assert.match(source, /function selectTransposeCell\(rowIndex: number, actualColIdx: number, event: MouseEvent\)/);
  assert.match(source, /transposeCellIsSelected\(cell\.recordIndex, cell\.valueIndex\)/);
  assert.match(source, /@click="selectTransposeCell\(cell\.recordIndex, cell\.valueIndex, \$event\)"/);
  assert.match(source, /@contextmenu="onTransposeCellContext\(cell\.recordIndex, cell\.valueIndex, \$event\)"/);
  assert.match(source, /showCellDetails\(cell\.recordIndex, cell\.valueIndex\)/);
});

test("transpose record headers copy selected records as rows", () => {
  assert.match(source, /function selectTransposeRecord\(rowIndex: number, event\?: MouseEvent\)/);
  assert.match(source, /function transposeRecordUsesSelectionVisual\(rowIndex: number\): boolean/);
  assert.match(source, /function transposeRecordUsesActiveHighlight\(rowIndex: number\): boolean/);
  assert.match(source, /function transposeRecordUsesFramedHeader\(rowIndex: number\): boolean/);
  assert.match(source, /transposeRecordUsesSelectionVisual\(/);
  assert.match(source, /transposeRecordUsesActiveHighlight\(/);
  assert.match(source, /transposeRecordUsesFramedHeader\(/);
  assert.match(source, /'transpose-record-header-selected text-primary font-semibold':/);
  assert.match(source, /'transpose-record-header-active text-primary':/);
  assert.match(source, /\.transpose-record-header-selected \{/);
  assert.match(source, /\.transpose-record-header-active \{/);
  assert.match(source, /'row-cell-selected':/);
  assert.match(source, /'row-cell-selected-dirty':/);
  assert.match(source, /handleRowClick\(rowIndex, item\.id, event\)/);
  assert.match(source, /@click="selectTransposeRecord\(recordIndex, \$event\)"/);
  assert.match(source, /@contextmenu="selectTransposeRecord\(recordIndex, \$event\)"/);
  assert.match(source, /function copyRowLabels\(\)/);
  assert.match(source, /const labels = copyRowLabels\(\)/);
  assert.match(source, /items\.push\(\{ label: labels\.row, action: copyRow \}\)/);
  assert.match(source, /t\("grid\.copyRows", \{ count \}\)/);
  assert.match(source, /t\("grid\.copyRow"\)/);
});
