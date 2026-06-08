import type { GridCellValue } from "@/lib/dataGridSql";
import type { DatabaseType, ColumnInfo } from "@/types/database";

export interface CoerceDataGridCellValueOptions {
  value: string;
  oldValue: GridCellValue | undefined;
  databaseType: DatabaseType | undefined;
  columnInfo: Pick<ColumnInfo, "data_type"> | undefined;
}

export function coerceDataGridCellValue(options: CoerceDataGridCellValueOptions): GridCellValue {
  const { value, oldValue } = options;
  if (value.toUpperCase() === "NULL") return null;
  if (value === "" && oldValue === null) return null;
  const postgresArrayValue = coercePostgresArrayValue(options);
  if (postgresArrayValue !== undefined) return postgresArrayValue;
  if (typeof oldValue === "number") {
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
  }
  if (typeof oldValue === "boolean") {
    return value === "true" || value === "1";
  }
  return normalizeSmartQuotedJsonInput(value);
}

export function dataGridCellEditorText(options: {
  value: GridCellValue | undefined;
  databaseType: DatabaseType | undefined;
  columnInfo: Pick<ColumnInfo, "data_type"> | undefined;
}): string {
  const value = options.value ?? null;
  if (value === null) return "";
  if (Array.isArray(value) && options.databaseType === "postgres" && isPostgresArrayColumn(options.columnInfo, value)) {
    return formatPostgresArrayText(value);
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function dataGridCellDisplayText(options: {
  value: GridCellValue;
  databaseType: DatabaseType | undefined;
  columnInfo: Pick<ColumnInfo, "data_type"> | undefined;
}): string | undefined {
  if (
    Array.isArray(options.value) &&
    options.databaseType === "postgres" &&
    isPostgresArrayColumn(options.columnInfo, options.value)
  ) {
    return formatPostgresArrayText(options.value);
  }
  return undefined;
}

function coercePostgresArrayValue(options: CoerceDataGridCellValueOptions): unknown[] | undefined {
  if (options.databaseType !== "postgres") return undefined;
  if (!isPostgresArrayColumn(options.columnInfo, options.oldValue)) return undefined;
  const trimmed = options.value.trim();
  if (!trimmed.startsWith("[")) return undefined;
  try {
    const parsed = JSON.parse(normalizeSmartQuotes(trimmed));
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isPostgresArrayColumn(
  columnInfo: Pick<ColumnInfo, "data_type"> | undefined,
  oldValue: GridCellValue | undefined,
): boolean {
  if (Array.isArray(oldValue)) return true;
  const dataType = columnInfo?.data_type.trim().toLowerCase() ?? "";
  return dataType === "array" || dataType.endsWith("[]") || dataType.startsWith("_");
}

function normalizeSmartQuotedJsonInput(value: string): string {
  if (!/[“”]/.test(value)) return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    JSON.parse(value);
    return value;
  } catch {
    // macOS smart punctuation can turn JSON delimiters into Chinese-style quotes.
  }
  const normalized = normalizeSmartQuotes(value);
  try {
    JSON.parse(normalized);
    return normalized;
  } catch {
    return value;
  }
}

function normalizeSmartQuotes(value: string): string {
  return value.replace(/[“”]/g, '"');
}

function formatPostgresArrayText(value: unknown[]): string {
  return `{${value.map(formatPostgresArrayElement).join(",")}}`;
}

function formatPostgresArrayElement(value: unknown): string {
  if (Array.isArray(value)) return formatPostgresArrayText(value);
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return "";
  if (!needsQuotedPostgresArrayElement(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function needsQuotedPostgresArrayElement(value: string): boolean {
  return value === "" || /[\s,"{}\\]/.test(value) || value.toUpperCase() === "NULL";
}
