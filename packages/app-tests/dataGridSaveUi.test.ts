import { strict as assert } from "node:assert";
import test from "node:test";
import { dataGridSaveActionMode } from "../../apps/desktop/src/lib/dataGridSaveUi.ts";

test("uses pending-change count as the primary grid save action label", () => {
  assert.deepEqual(dataGridSaveActionMode({ pendingChangeCount: 3, useTransaction: true }), {
    labelKey: "grid.pendingChanges",
    tooltipKey: "grid.transactionSaveHint",
    secondaryActionKey: "grid.rollback",
  });

  assert.deepEqual(dataGridSaveActionMode({ pendingChangeCount: 3, useTransaction: false }), {
    labelKey: "grid.pendingChanges",
    tooltipKey: "grid.nonTransactionalSaveHint",
    secondaryActionKey: "grid.discard",
  });
});
