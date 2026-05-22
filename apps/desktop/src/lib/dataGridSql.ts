import type { DatabaseType } from "@/types/database";
import { DBX_ROWID_COLUMN } from "./tableEditing.ts";
import { qualifiedTableName, quoteTableIdentifier } from "./tableSelectSql.ts";

export type GridCellValue = string | number | boolean | null;

export interface DataGridTableMeta {
  schema?: string;
  tableName: string;
  primaryKeys: string[];
  columns?: DataGridColumnInfo[];
}

export interface DataGridColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default?: string | null;
  extra?: string | null;
}

export type GridSqlLiteralColumnInfo = Pick<DataGridColumnInfo, "data_type">;

export interface DataGridSaveStatementOptions {
  databaseType?: DatabaseType;
  tableMeta: DataGridTableMeta;
  columns: string[];
  sourceColumns?: Array<string | undefined>;
  rows: GridCellValue[][];
  dirtyRows: Array<[number, Array<[number, GridCellValue]>]>;
  deletedRows: number[];
  newRows: GridCellValue[][];
}

export interface DataGridCopyUpdateStatementOptions {
  databaseType?: DatabaseType;
  tableMeta: DataGridTableMeta;
  columns: string[];
  sourceColumns?: Array<string | undefined>;
  rows: GridCellValue[][];
}

export interface DataGridCopyInsertStatementOptions {
  databaseType?: DatabaseType;
  tableMeta?: DataGridTableMeta;
  columns: string[];
  sourceColumns?: Array<string | undefined>;
  rows: GridCellValue[][];
  excludePrimaryKeys?: boolean;
}

export function buildDataGridCopyUpdateStatements(options: DataGridCopyUpdateStatementOptions): string[] {
  if (options.databaseType === "neo4j" || options.databaseType === "tdengine") return [];
  const primaryKeys = options.tableMeta.primaryKeys;
  if (primaryKeys.length === 0) return [];

  const saveColumns = effectiveColumns(options.sourceColumns, options.columns);
  const columnInfo = columnInfoByName(options.tableMeta.columns);
  const primaryKeyIndexes = primaryKeys.map((primaryKey) => findColumnIndex(saveColumns, primaryKey));
  if (primaryKeyIndexes.some((index) => index === -1)) return [];

  const primaryKeySet = new Set(primaryKeys.map((primaryKey) => normalizeColumnName(primaryKey)));
  const writableIndexes = saveColumns
    .map((column, index) => ({ column, index }))
    .filter((entry): entry is { column: string; index: number } => !!entry.column)
    .filter((entry) => !primaryKeySet.has(normalizeColumnName(entry.column)))
    .filter((entry) => !isOracleRowId(options.databaseType, entry.column));

  if (writableIndexes.length === 0) return [];

  const table = qualifiedTableName({
    databaseType: options.databaseType,
    schema: options.tableMeta.schema,
    tableName: options.tableMeta.tableName,
  });

  const statements: string[] = [];
  for (const row of options.rows) {
    if (primaryKeyIndexes.some((index) => row[index] === null || row[index] === undefined)) continue;
    const sets = writableIndexes
      .map(
        ({ column, index }) =>
          `${quoteIdent(options.databaseType, column)} = ${formatGridSqlLiteral(
            row[index],
            options.databaseType,
            columnInfo.get(normalizeColumnName(column)),
          )}`,
      )
      .join(", ");
    if (!sets) continue;
    const where = primaryKeys
      .map((primaryKey, index) =>
        buildColumnPredicate(
          options.databaseType,
          primaryKey,
          row[primaryKeyIndexes[index]],
          columnInfo.get(normalizeColumnName(primaryKey)),
        ),
      )
      .join(" AND ");
    statements.push(`UPDATE ${table} SET ${sets} WHERE ${where};`);
  }

  return statements;
}

export function buildDataGridCopyInsertStatement(options: DataGridCopyInsertStatementOptions): string | undefined {
  const saveColumns = effectiveColumns(options.sourceColumns, options.columns);
  const columnInfo = columnInfoByName(options.tableMeta?.columns);
  const primaryKeySet = new Set(
    (options.tableMeta?.primaryKeys ?? []).map((primaryKey) => normalizeColumnName(primaryKey)),
  );
  const insertableColumns = saveColumns
    .map((column, index) => ({ column, index }))
    .filter((entry): entry is { column: string; index: number } => !!entry.column)
    .filter((entry) => !isOracleRowId(options.databaseType, entry.column));
  const insertColumns = insertableColumns.filter(
    (entry) => !options.excludePrimaryKeys || !primaryKeySet.has(normalizeColumnName(entry.column)),
  );

  if (options.excludePrimaryKeys && insertColumns.length === insertableColumns.length) return undefined;
  if (insertColumns.length === 0 || options.rows.length === 0) return undefined;

  const table = options.tableMeta
    ? qualifiedTableName({
        databaseType: options.databaseType,
        schema: options.tableMeta.schema,
        tableName: options.tableMeta.tableName,
      })
    : "table_name";
  const columns = insertColumns.map((entry) => quoteIdent(options.databaseType, entry.column)).join(", ");
  const valueRows = options.rows.map(
    (row) =>
      `(${insertColumns
        .map(({ column, index }) =>
          formatGridSqlLiteral(row[index], options.databaseType, columnInfo.get(normalizeColumnName(column))),
        )
        .join(", ")})`,
  );

  return `INSERT INTO ${table} (${columns}) VALUES${valueRows.length === 1 ? " " : "\n"}${valueRows.join(",\n")};`;
}

function effectiveColumns(
  sourceColumns: Array<string | undefined> | undefined,
  columns: string[],
): Array<string | undefined> {
  if (!sourceColumns || sourceColumns.length !== columns.length) return columns;
  return sourceColumns;
}

function columnInfoByName(columns: DataGridColumnInfo[] | undefined): Map<string, DataGridColumnInfo> {
  return new Map((columns ?? []).map((column) => [normalizeColumnName(column.name), column]));
}

export function normalizeDataGridSaveError(databaseType: DatabaseType | undefined, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (databaseType === "hive" && /Attempt to do update or delete|Error 10294/i.test(message)) {
    return "Hive UPDATE/DELETE are not enabled for this table or server. Add rows with INSERT, or enable ACID transactional tables in Hive before editing/deleting existing rows.";
  }
  return message;
}

export function formatGridSqlLiteral(
  value: GridCellValue,
  databaseType?: DatabaseType,
  columnInfo?: GridSqlLiteralColumnInfo,
): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = String(value);
  if (text === "") return databaseType === "sqlserver" ? "N''" : "''";
  const literalText =
    databaseType === "tdengine"
      ? formatTdengineTimestampLiteralText(text)
      : isMysqlDatetimeLiteralDatabase(databaseType) && (!columnInfo || isTemporalColumnType(columnInfo.data_type))
        ? formatMysqlTemporalLiteralText(text, columnInfo?.data_type)
        : text;
  const escaped = `'${literalText.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  return databaseType === "sqlserver" ? `N${escaped}` : escaped;
}

function isMysqlDatetimeLiteralDatabase(databaseType: DatabaseType | undefined): boolean {
  return (
    databaseType === "mysql" ||
    databaseType === "doris" ||
    databaseType === "starrocks" ||
    databaseType === "goldendb" ||
    databaseType === "sundb"
  );
}

function formatMysqlTemporalLiteralText(text: string, dataType: string | undefined): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.exec(text);
  if (!match) return text;
  const kind = temporalColumnKind(dataType);
  if (kind === "date") return match[1];
  if (kind === "time") return `${match[2]}${normalizeMysqlFractionalSeconds(match[3])}`;
  return `${match[1]} ${match[2]}${normalizeMysqlFractionalSeconds(match[3])}`;
}

function normalizeMysqlFractionalSeconds(fraction: string | undefined): string {
  if (!fraction) return "";
  return fraction.length > 7 ? fraction.slice(0, 7) : fraction;
}

function isTemporalColumnType(dataType: string | undefined): boolean {
  return temporalColumnKind(dataType) !== undefined;
}

function temporalColumnKind(dataType: string | undefined): "date" | "time" | "datetime" | undefined {
  const base = (dataType ?? "")
    .trim()
    .toLowerCase()
    .split(/[(:\s]/)[0];
  if (base === "date") return "date";
  if (base === "time") return "time";
  if (base === "datetime" || base === "timestamp") return "datetime";
  return undefined;
}

function formatTdengineTimestampLiteralText(text: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d{1,9})?$/.exec(text);
  if (!match) return text;
  return `${match[1]}T${match[2]}${normalizeFractionalSeconds(match[3])}${localTimezoneOffsetSuffix(text)}`;
}

function normalizeFractionalSeconds(fraction: string | undefined): string {
  if (!fraction) return ".000";
  return fraction.length >= 4 ? fraction.slice(0, 4) : fraction.padEnd(4, "0");
}

function localTimezoneOffsetSuffix(text: string): string {
  const date = new Date(text.replace(" ", "T"));
  const offsetMinutes = Number.isNaN(date.getTime()) ? new Date().getTimezoneOffset() : date.getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function buildColumnPredicate(
  databaseType: DatabaseType | undefined,
  column: string,
  value: GridCellValue,
  columnInfo?: DataGridColumnInfo,
): string {
  const ident = predicateIdent(databaseType, column);
  if (value === null || value === undefined) return `${ident} IS NULL`;
  return `${ident} = ${formatGridSqlLiteral(value, databaseType, columnInfo)}`;
}

function isOracleRowId(databaseType: DatabaseType | undefined, name: string | undefined): boolean {
  return databaseType === "oracle" && name?.toUpperCase() === DBX_ROWID_COLUMN;
}

function findColumnIndex(columns: Array<string | undefined>, target: string): number {
  const normalizedTarget = normalizeColumnName(target);
  return columns.findIndex((column) => (column ? normalizeColumnName(column) : "") === normalizedTarget);
}

function normalizeColumnName(name: string): string {
  return name.toUpperCase();
}

function predicateIdent(databaseType: DatabaseType | undefined, name: string): string {
  return isOracleRowId(databaseType, name) ? "ROWIDTOCHAR(ROWID)" : quoteIdent(databaseType, name);
}

function quoteIdent(databaseType: DatabaseType | undefined, name: string): string {
  return quoteTableIdentifier(databaseType, name);
}
