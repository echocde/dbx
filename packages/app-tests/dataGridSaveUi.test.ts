import { strict as assert } from "node:assert";
import test from "node:test";
import { dataGridSaveActionMode } from "../../apps/desktop/src/lib/dataGridSaveUi.ts";

test("uses concise save and commit labels for the primary grid save action", () => {
  assert.deepEqual(dataGridSaveActionMode({ pendingChangeCount: 3, useTransaction: true }), {
    labelKey: "grid.commit",
    tooltipKey: "grid.transactionSaveHint",
    secondaryActionKey: "grid.rollback",
  });

  assert.deepEqual(dataGridSaveActionMode({ pendingChangeCount: 3, useTransaction: false }), {
    labelKey: "grid.save",
    tooltipKey: "grid.nonTransactionalSaveHint",
    secondaryActionKey: "grid.discard",
  });
});
