export interface DataGridSaveActionMode {
  labelKey: "grid.commit" | "grid.save";
  tooltipKey: "grid.transactionSaveHint" | "grid.nonTransactionalSaveHint";
  secondaryActionKey: "grid.rollback" | "grid.discard";
}

export function dataGridSaveActionMode(options: {
  pendingChangeCount: number;
  useTransaction: boolean;
}): DataGridSaveActionMode {
  return {
    labelKey: options.useTransaction ? "grid.commit" : "grid.save",
    tooltipKey: options.useTransaction ? "grid.transactionSaveHint" : "grid.nonTransactionalSaveHint",
    secondaryActionKey: options.useTransaction ? "grid.rollback" : "grid.discard",
  };
}
