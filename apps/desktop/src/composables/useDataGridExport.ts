import { computed, type ComputedRef, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { isTauriRuntime } from "@/lib/tauriRuntime";
import * as api from "@/lib/api";
import {
  formatSelectionAsCsv,
  formatSelectionAsJson,
  formatSelectionAsSqlInList,
  formatSelectionAsTsv,
  type CellSelectionRange,
  type SelectionData,
} from "@/lib/gridSelection";
import { useToast } from "@/composables/useToast";
import { displayCellValue, type CellValue } from "@/lib/cellValue";
import { tryStartExclusiveActivation, type ActionActivationGuard } from "@/lib/actionActivation";
import { copyToClipboard } from "@/lib/clipboard";
import { buildDataGridCopyInsertStatement, buildDataGridCopyUpdateStatements } from "@/lib/dataGridSql";
import type { DatabaseType } from "@/types/database";

interface RowItem {
  id: number;
  sourceIndex?: number;
  newIndex?: number;
  data: CellValue[];
  isNew: boolean;
  isDeleted: boolean;
  isDirtyCol: boolean[];
  status: string;
}

export interface UseDataGridExportOptions {
  columns: ComputedRef<string[]>;
  displayItems: ComputedRef<RowItem[]>;
  sql: ComputedRef<string | undefined>;
  tableMeta: ComputedRef<{ schema?: string; tableName: string; primaryKeys: string[] } | undefined>;
  databaseType: ComputedRef<DatabaseType | undefined>;
  sourceColumns: ComputedRef<Array<string | undefined> | undefined>;
  hasCellSelection: ComputedRef<boolean>;
  selectedCells: ComputedRef<SelectionData>;
  selectedRange: ComputedRef<CellSelectionRange | null>;
  contextCell:
    | Ref<{ rowId: number; rowIndex: number; col: number } | null>
    | ComputedRef<{ rowId: number; rowIndex: number; col: number } | null>;
  getRowItem: (rowId: number) => RowItem | undefined;
  selectedRowIds: Ref<Set<number>> | ComputedRef<Set<number>>;
  hasRowSelection: ComputedRef<boolean>;
}

export function useDataGridExport(options: UseDataGridExportOptions) {
  const { t } = useI18n();
  const { toast } = useToast();
  const exportGuard: ActionActivationGuard = {};

  const {
    columns,
    displayItems,
    sql,
    tableMeta,
    sourceColumns,
    databaseType,
    hasCellSelection,
    selectedCells,
    selectedRange,
    contextCell,
    getRowItem,
    selectedRowIds,
    hasRowSelection,
  } = options;

  async function copyText(text: string) {
    try {
      await copyToClipboard(text);
      toast(t("grid.copied"));
    } catch (e: any) {
      toast(t("grid.copyFailed", { message: e?.message || String(e) }), 5000);
    }
  }

  function rowsToExport(rowIds?: number[]): RowItem[] {
    if (!rowIds?.length) return displayItems.value;
    const rowIdSet = new Set(rowIds);
    return displayItems.value.filter((item) => rowIdSet.has(item.id));
  }

  function targetedRows(): RowItem[] {
    if (hasRowSelection.value && selectedRowIds.value.size > 0) {
      return displayItems.value.filter((item) => selectedRowIds.value.has(item.id));
    }
    const range = selectedRange.value;
    if (range && range.startRow !== range.endRow) {
      return displayItems.value.slice(range.startRow, range.endRow + 1);
    }
    if (!contextCell.value) return [];
    const item = getRowItem(contextCell.value.rowId);
    return item ? [item] : [];
  }

  function updateEligibleRows(): RowItem[] {
    return targetedRows().filter((item) => !item.isNew && !item.isDeleted);
  }

  // --- Selection copy functions ---
  async function copySelectionTsv() {
    if (!hasCellSelection.value) return;
    await copyText(formatSelectionAsTsv(selectedCells.value));
  }

  async function copySelectionCsv() {
    if (!hasCellSelection.value) return;
    await copyText(formatSelectionAsCsv(selectedCells.value));
  }

  async function copySelectionJson() {
    if (!hasCellSelection.value) return;
    await copyText(formatSelectionAsJson(selectedCells.value));
  }

  async function copySelectionSqlInList() {
    if (!hasCellSelection.value) return;
    await copyText(formatSelectionAsSqlInList(selectedCells.value));
  }

  // --- Cell/row copy ---
  async function copyCell() {
    if (!contextCell.value || contextCell.value.col < 0) return;
    const item = getRowItem(contextCell.value.rowId);
    const val = item?.data[contextCell.value.col] ?? null;
    await copyText(displayCellValue(val));
  }

  async function copyRow() {
    if (hasRowSelection.value && selectedRowIds.value.size > 0) {
      const items = displayItems.value.filter((item) => selectedRowIds.value.has(item.id));
      const objects = items.map((item) => {
        const obj: Record<string, unknown> = {};
        columns.value.forEach((col, i) => {
          obj[col] = item.data[i];
        });
        return obj;
      });
      await copyText(JSON.stringify(objects, null, 2));
      return;
    }
    const range = selectedRange.value;
    if (range && range.startRow !== range.endRow) {
      const items = displayItems.value.slice(range.startRow, range.endRow + 1);
      const objects = items.map((item) => {
        const obj: Record<string, unknown> = {};
        columns.value.forEach((col, i) => {
          obj[col] = item.data[i];
        });
        return obj;
      });
      await copyText(JSON.stringify(objects, null, 2));
      return;
    }
    if (!contextCell.value) return;
    const item = getRowItem(contextCell.value.rowId);
    if (!item) return;
    const obj: Record<string, unknown> = {};
    columns.value.forEach((col, i) => {
      obj[col] = item.data[i];
    });
    await copyText(JSON.stringify(obj, null, 2));
  }

  function insertEligibleRows(): RowItem[] {
    return targetedRows();
  }

  async function copyRowAsInsertStatement(excludePrimaryKeys: boolean) {
    const statement = await buildDataGridCopyInsertStatement({
      databaseType: databaseType.value,
      tableMeta: tableMeta.value,
      columns: columns.value,
      sourceColumns: sourceColumns.value,
      rows: insertEligibleRows().map((item) => item.data),
      excludePrimaryKeys,
    });
    if (!statement) return;
    await copyText(statement);
  }

  async function copyRowAsInsert() {
    await copyRowAsInsertStatement(false);
  }

  async function copyRowAsInsertWithoutPrimaryKeys() {
    await copyRowAsInsertStatement(true);
  }

  async function copyRowAsUpdate() {
    if (!tableMeta.value?.primaryKeys.length) return;
    const statements = await buildDataGridCopyUpdateStatements({
      databaseType: databaseType.value,
      tableMeta: tableMeta.value,
      columns: columns.value,
      sourceColumns: sourceColumns.value,
      rows: updateEligibleRows().map((item) => item.data),
    });
    if (!statements.length) return;
    await copyText(statements.join("\n"));
  }

  const canCopyRowAsUpdate = computed(() => {
    if (!tableMeta.value?.primaryKeys.length) return false;
    const rows = updateEligibleRows();
    if (!rows.length) return false;
    if (databaseType.value === "neo4j" || databaseType.value === "tdengine") return false;
    const saveColumns = effectiveColumns(sourceColumns.value, columns.value);
    const primaryKeys = tableMeta.value.primaryKeys;
    if (primaryKeys.some((primaryKey) => findColumnIndex(saveColumns, primaryKey) === -1)) return false;
    const primaryKeySet = new Set(primaryKeys.map(normalizeColumnName));
    return saveColumns.some((column) => column && !primaryKeySet.has(normalizeColumnName(column)));
  });

  const canCopyRowAsInsertWithoutPrimaryKeys = computed(() => {
    if (!tableMeta.value?.primaryKeys.length) return false;
    const rows = insertEligibleRows();
    if (!rows.length) return false;
    const saveColumns = effectiveColumns(sourceColumns.value, columns.value);
    const primaryKeySet = new Set(tableMeta.value.primaryKeys.map(normalizeColumnName));
    const insertableCount = saveColumns.filter(Boolean).length;
    const insertColumnsCount = saveColumns.filter(
      (column) => column && !primaryKeySet.has(normalizeColumnName(column)),
    ).length;
    return insertColumnsCount > 0 && insertColumnsCount < insertableCount;
  });

  async function copyAll() {
    const header = columns.value.join("\t");
    const body = displayItems.value.map((item) => item.data.map((c) => displayCellValue(c)).join("\t")).join("\n");
    await copyText(`${header}\n${body}`);
  }

  // --- Export functions ---
  async function runExclusiveExport(action: () => Promise<void>) {
    const finish = tryStartExclusiveActivation(exportGuard);
    if (!finish) return;
    try {
      await action();
    } finally {
      finish();
    }
  }

  async function exportCsv(rowIds?: number[]) {
    await runExclusiveExport(async () => {
      try {
        const rows = rowsToExport(rowIds).map((item) => item.data.map((c) => displayCellValue(c)));
        let outputPath = "export.csv";
        if (isTauriRuntime()) {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const path = await save({
            defaultPath: outputPath,
            filters: [{ name: "CSV", extensions: ["csv"] }],
          });
          if (!path) return;
          outputPath = path as string;
        }
        await api.exportQueryResultCsv(outputPath, columns.value, rows);
        toast(t("grid.exported"));
      } catch (e: any) {
        toast(t("grid.exportFailed", { message: e?.message || String(e) }), 5000);
      }
    });
  }

  async function exportJson(rowIds?: number[]) {
    await runExclusiveExport(async () => {
      try {
        let outputPath = "export.json";
        if (isTauriRuntime()) {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const path = await save({
            defaultPath: outputPath,
            filters: [{ name: "JSON", extensions: ["json"] }],
          });
          if (!path) return;
          outputPath = path as string;
        }
        await api.exportQueryResultJson(
          outputPath,
          columns.value,
          rowsToExport(rowIds).map((item) => item.data),
        );
        toast(t("grid.exported"));
      } catch (e: any) {
        toast(t("grid.exportFailed", { message: e?.message || String(e) }), 5000);
      }
    });
  }

  async function exportMarkdown(rowIds?: number[]) {
    await runExclusiveExport(async () => {
      try {
        let outputPath = "export.md";
        if (isTauriRuntime()) {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const path = await save({
            defaultPath: outputPath,
            filters: [{ name: "Markdown", extensions: ["md"] }],
          });
          if (!path) return;
          outputPath = path as string;
        }
        await api.exportQueryResultMarkdown(
          outputPath,
          columns.value,
          rowsToExport(rowIds).map((item) => item.data),
        );
        toast(t("grid.exported"));
      } catch (e: any) {
        toast(t("grid.exportFailed", { message: e?.message || String(e) }), 5000);
      }
    });
  }

  async function exportXlsx(rowIds?: number[]) {
    await runExclusiveExport(async () => {
      try {
        let outputPath = "export.xlsx";
        if (isTauriRuntime()) {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const path = await save({
            defaultPath: outputPath,
            filters: [{ name: "Excel", extensions: ["xlsx"] }],
          });
          if (!path) return;
          outputPath = path as string;
        }
        await api.exportQueryResultXlsx(
          outputPath,
          tableMeta.value?.tableName || "Export",
          columns.value,
          rowsToExport(rowIds).map((item) => item.data),
        );
        toast(t("grid.exported"));
      } catch (e: any) {
        toast(t("grid.exportFailed", { message: e?.message || String(e) }), 5000);
      }
    });
  }

  async function copySql() {
    if (!sql.value) return;
    await copyText(sql.value);
  }

  return {
    copyText,
    copyCell,
    copyRow,
    copyRowAsInsert,
    copyRowAsInsertWithoutPrimaryKeys,
    copyRowAsUpdate,
    canCopyRowAsInsertWithoutPrimaryKeys,
    canCopyRowAsUpdate,
    copyAll,
    copySelectionTsv,
    copySelectionCsv,
    copySelectionJson,
    copySelectionSqlInList,
    exportCsv,
    exportJson,
    exportMarkdown,
    exportXlsx,
    copySql,
  };
}

function effectiveColumns(
  sourceColumns: Array<string | undefined> | undefined,
  columns: string[],
): Array<string | undefined> {
  if (!sourceColumns || sourceColumns.length !== columns.length) return columns;
  return sourceColumns;
}

function findColumnIndex(columns: Array<string | undefined>, target: string): number {
  const normalizedTarget = normalizeColumnName(target);
  return columns.findIndex((column) => (column ? normalizeColumnName(column) : "") === normalizedTarget);
}

function normalizeColumnName(name: string): string {
  return name.toUpperCase();
}
