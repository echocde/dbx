export interface DataGridSaveActionMode {
  labelKey: "grid.pendingChanges";
  tooltipKey: "grid.transactionSaveHint" | "grid.nonTransactionalSaveHint";
  secondaryActionKey: "grid.rollback" | "grid.discard";
}

export function dataGridSaveActionMode(options: {
  pendingChangeCount: number;
  useTransaction: boolean;
}): DataGridSaveActionMode {
  return {
    labelKey: "grid.pendingChanges",
    tooltipKey: options.useTransaction ? "grid.transactionSaveHint" : "grid.nonTransactionalSaveHint",
    secondaryActionKey: options.useTransaction ? "grid.rollback" : "grid.discard",
  };
}
