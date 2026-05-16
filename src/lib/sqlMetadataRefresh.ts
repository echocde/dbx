export type SqlMetadataRefreshScope = "none" | "connection" | "database";

const DATABASE_DDL_RE = /\b(CREATE|DROP)\s+(DATABASE|SCHEMA)\b/i;
const OBJECT_DDL_RE =
  /\b(CREATE|ALTER|DROP|RENAME)\s+(OR\s+REPLACE\s+)?(((GLOBAL|LOCAL)\s+)?TEMP(ORARY)?\s+)?(MATERIALIZED\s+)?(TABLE|VIEW|INDEX|SEQUENCE|PROCEDURE|FUNCTION|TRIGGER|TYPE)\b/i;

function stripSqlMetadataComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/#.*$/gm, " ");
}

export function sqlMetadataRefreshScope(sql: string): SqlMetadataRefreshScope {
  const cleaned = stripSqlMetadataComments(sql);
  if (DATABASE_DDL_RE.test(cleaned)) return "connection";
  if (OBJECT_DDL_RE.test(cleaned)) return "database";
  return "none";
}
