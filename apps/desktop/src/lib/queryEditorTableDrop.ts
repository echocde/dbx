import type { DatabaseType } from "@/types/database";
import { qualifiedTableName } from "@/lib/tableSelectSql";

export const DBX_TABLE_REFERENCE_MIME = "application/x-dbx-table-reference";

export interface QueryEditorTableReferencePayload {
  kind: "dbx-table-reference";
  connectionId: string;
  database: string;
  schema?: string;
  tableName: string;
  databaseType?: DatabaseType;
}

export function createTableReferencePayload(options: {
  connectionId?: string;
  database?: string;
  schema?: string;
  tableName?: string;
  databaseType?: DatabaseType;
}): QueryEditorTableReferencePayload | null {
  if (!options.connectionId || !options.database || !options.tableName) return null;
  return {
    kind: "dbx-table-reference",
    connectionId: options.connectionId,
    database: options.database,
    schema: options.schema,
    tableName: options.tableName,
    databaseType: options.databaseType,
  };
}

export function serializeTableReferencePayload(payload: QueryEditorTableReferencePayload): string {
  return JSON.stringify(payload);
}

export function parseTableReferencePayload(value: string | undefined | null): QueryEditorTableReferencePayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<QueryEditorTableReferencePayload>;
    if (
      parsed.kind !== "dbx-table-reference" ||
      typeof parsed.connectionId !== "string" ||
      typeof parsed.database !== "string" ||
      typeof parsed.tableName !== "string" ||
      !parsed.connectionId ||
      !parsed.database ||
      !parsed.tableName
    ) {
      return null;
    }
    return {
      kind: "dbx-table-reference",
      connectionId: parsed.connectionId,
      database: parsed.database,
      schema: typeof parsed.schema === "string" && parsed.schema ? parsed.schema : undefined,
      tableName: parsed.tableName,
      databaseType: parsed.databaseType,
    };
  } catch {
    return null;
  }
}

export function hasTableReferencePayloadType(types: Iterable<string> | undefined | null): boolean {
  if (!types) return false;
  for (const type of types) {
    if (type === DBX_TABLE_REFERENCE_MIME) return true;
  }
  return false;
}

export function tableReferenceInsertText(
  payload: QueryEditorTableReferencePayload,
  fallbackDatabaseType?: DatabaseType,
): string {
  return qualifiedTableName({
    databaseType: payload.databaseType ?? fallbackDatabaseType,
    schema: payload.schema,
    tableName: payload.tableName,
  });
}
