import { strict as assert } from "node:assert";
import test from "node:test";
import {
  canFormatCellDetailJson,
  cellDetailEditorText,
  defaultCellDetailTab,
  visibleCellDetailTabs,
  valueEditorActions,
  type CellDetailPresentationOptions,
} from "../../apps/desktop/src/lib/cellDetailPresentation.ts";

function options(overrides: Partial<CellDetailPresentationOptions> = {}): CellDetailPresentationOptions {
  return {
    isEditable: false,
    ...overrides,
  };
}

test("cell detail drawer keeps the original details tab as the default", () => {
  assert.equal(defaultCellDetailTab(), "details");
});

test("cell detail drawer only shows the original details tab for readonly cells", () => {
  assert.deepEqual(visibleCellDetailTabs(options()), ["details"]);
});

test("cell detail drawer adds a long value editor tab for editable cells", () => {
  assert.deepEqual(visibleCellDetailTabs(options({ isEditable: true })), ["details", "valueEditor"]);
});

test("cell detail value editor restores the original value text on cancel", () => {
  assert.equal(cellDetailEditorText({ nested: true }), '{"nested":true}');
  assert.equal(cellDetailEditorText(null), "");
  assert.equal(cellDetailEditorText("already text"), "already text");
});

test("cell detail value editor keeps json text unchanged until formatting is requested", () => {
  assert.equal(cellDetailEditorText('{"nested":true,"items":[1,2]}', "jsonb"), '{"nested":true,"items":[1,2]}');
  assert.equal(cellDetailEditorText('{"nested":true}', "varchar"), '{"nested":true}');
  assert.equal(cellDetailEditorText("{invalid", "json"), "{invalid");
});

test("cell detail value editor allows json-like string values to be manually formatted", () => {
  assert.equal(cellDetailEditorText('{"name":"示例","value":123}'), '{"name":"示例","value":123}');
  assert.equal(canFormatCellDetailJson('{"name":"示例","value":123}'), true);
  assert.equal(canFormatCellDetailJson("plain text"), false);
});

test("cell detail value editor uses cell actions instead of confirm and cancel", () => {
  assert.deepEqual(valueEditorActions({ canSetNull: true, canFormatJson: true }), [
    "formatJson",
    "setNull",
    "restoreOriginal",
  ]);
  assert.deepEqual(valueEditorActions({ canSetNull: false }), ["restoreOriginal"]);
});
