use futures::StreamExt;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions, SqliteRow};
use sqlx::{Column, Executor, Row};
use std::str::FromStr;
use std::time::{Duration, Instant};

use super::file_validator::validate_file_path;
use crate::sql::starts_with_executable_sql_keyword;
use crate::types::{ColumnInfo, DatabaseInfo, ForeignKeyInfo, IndexInfo, QueryResult, TableInfo, TriggerInfo};

pub async fn connect_path(path: &str) -> Result<SqlitePool, String> {
    let is_memory = is_memory_database_path(path);
    if !is_memory {
        validate_file_path(path, is_network_path)?;
    }

    let mut options = if is_memory {
        SqliteConnectOptions::from_str("sqlite::memory:").map_err(|e| format!("SQLite connection failed: {e}"))?
    } else {
        SqliteConnectOptions::new().filename(path).create_if_missing(false)
    };

    if is_network_path(path) {
        options = options.vfs("unix-nolock");
    }

    SqlitePoolOptions::new()
        .max_connections(if is_memory { 1 } else { 5 })
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .connect_with(options)
        .await
        .map_err(|e| format!("SQLite connection failed: {e}"))
}

fn is_network_path(path: &str) -> bool {
    path.starts_with("\\\\") || path.starts_with("//") || path.contains("wsl.localhost") || path.contains("wsl$")
}

pub fn is_memory_database_path(path: &str) -> bool {
    path.trim().eq_ignore_ascii_case(":memory:")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn connect_path_supports_memory_database_across_statements() {
        let pool = connect_path(":memory:").await.expect("connect in-memory SQLite");

        execute_query(&pool, "CREATE TABLE memory_probe (id INTEGER PRIMARY KEY, name TEXT);")
            .await
            .expect("create table");
        execute_query(&pool, "INSERT INTO memory_probe (name) VALUES ('Ada');").await.expect("insert row");
        let result = execute_query(&pool, "SELECT name FROM memory_probe WHERE id = 1;").await.expect("select row");

        assert_eq!(result.rows[0][0], serde_json::json!("Ada"));
    }

    #[test]
    fn normalize_if_to_iif_basic() {
        assert_eq!(normalize_sqlite_sql("SELECT if(1, 'a', 'b')"), "SELECT IIF(1, 'a', 'b')");
        assert_eq!(normalize_sqlite_sql("SELECT if(1, if(0, 'x', 'y'), 'b')"), "SELECT IIF(1, IIF(0, 'x', 'y'), 'b')");
    }

    #[test]
    fn normalize_substring_to_substr() {
        assert_eq!(normalize_sqlite_sql("SELECT substring(name, 1, 3) FROM t"), "SELECT substr(name, 1, 3) FROM t");
        assert_eq!(normalize_sqlite_sql("SELECT substring(name, 2) FROM t"), "SELECT substr(name, 2) FROM t");
    }

    #[test]
    fn normalize_preserves_string_literals() {
        let sql = "SELECT 'if(1,2,3)' AS literal, 'substring(x,1,2)', if(1, 'ok', 'no')";
        let normalized = normalize_sqlite_sql(sql);
        assert_eq!(normalized, "SELECT 'if(1,2,3)' AS literal, 'substring(x,1,2)', IIF(1, 'ok', 'no')");
    }

    #[test]
    fn normalize_preserves_line_comments() {
        let sql = "-- if(1,2,3) is a comment\nSELECT if(1, 'x', 'y')";
        let normalized = normalize_sqlite_sql(sql);
        assert_eq!(normalized, "-- if(1,2,3) is a comment\nSELECT IIF(1, 'x', 'y')");
    }

    #[test]
    fn normalize_preserves_block_comments() {
        let sql = "/* if(1,2,3) */ SELECT if(1, 'x', 'y')";
        let normalized = normalize_sqlite_sql(sql);
        assert_eq!(normalized, "/* if(1,2,3) */ SELECT IIF(1, 'x', 'y')");
    }

    #[test]
    fn normalize_does_not_match_inside_words() {
        let sql = "SELECT difference, stiff, ifsubstring FROM t";
        let normalized = normalize_sqlite_sql(sql);
        assert_eq!(normalized, sql);
    }

    #[test]
    fn normalize_if_with_spaces_before_paren() {
        assert_eq!(normalize_sqlite_sql("SELECT if  (1, 'a', 'b')"), "SELECT IIF  (1, 'a', 'b')");
    }

    #[tokio::test]
    async fn view_with_if_function_works_after_normalization() {
        let pool = connect_path(":memory:").await.expect("connect in-memory SQLite");

        // Create a view that uses if() — this succeeds because CREATE VIEW
        // just stores the SQL text without evaluating it
        execute_query(&pool, "CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1), (2), (3);")
            .await
            .expect("create and populate table");

        execute_query(&pool, "CREATE VIEW v AS SELECT x, IIF(x > 1, 'big', 'small') AS label FROM t")
            .await
            .expect("create view");

        // Query the view — this must go through normalize_sqlite_sql
        let result = execute_query(&pool, "SELECT * FROM v ORDER BY x").await.expect("query view");

        assert_eq!(result.rows.len(), 3);
        assert_eq!(result.rows[0][1], serde_json::json!("small"));
        assert_eq!(result.rows[1][1], serde_json::json!("big"));
    }

    #[tokio::test]
    async fn if_rewrite_works_in_direct_query() {
        let pool = connect_path(":memory:").await.expect("connect in-memory SQLite");

        // if() is not a built-in SQLite function — the normalizer must rewrite it to IIF()
        let result = execute_query(&pool, "SELECT if(1 = 1, 'yes', 'no') AS answer")
            .await
            .expect("if() should be rewritten to IIF()");

        assert_eq!(result.rows[0][0], serde_json::json!("yes"));
    }

    #[tokio::test]
    async fn substring_rewrite_works_in_direct_query() {
        let pool = connect_path(":memory:").await.expect("connect in-memory SQLite");

        execute_query(&pool, "CREATE TABLE t (name TEXT); INSERT INTO t VALUES ('hello');").await.expect("setup");

        let result = execute_query(&pool, "SELECT substring(name, 1, 2) AS s FROM t")
            .await
            .expect("substring() should be rewritten to substr()");

        assert_eq!(result.rows[0][0], serde_json::json!("he"));
    }

    #[tokio::test]
    async fn both_rewrites_combined() {
        let pool = connect_path(":memory:").await.expect("connect in-memory SQLite");

        execute_query(&pool, "CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1), (2);").await.expect("setup");

        let result = execute_query(&pool, "SELECT substring(if(x > 1, 'big', 'small'), 1, 1) AS s FROM t ORDER BY x")
            .await
            .expect("combined rewrite");

        assert_eq!(result.rows[0][0], serde_json::json!("s"));
        assert_eq!(result.rows[1][0], serde_json::json!("b"));
    }
}

pub async fn list_databases(_pool: &SqlitePool) -> Result<Vec<DatabaseInfo>, String> {
    Ok(vec![DatabaseInfo { name: "main".to_string() }])
}

pub async fn list_tables(pool: &SqlitePool, _schema: &str) -> Result<Vec<TableInfo>, String> {
    let rows: Vec<SqliteRow> = sqlx::query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| {
            let t: String = row.get("type");
            TableInfo {
                name: row.get::<String, _>("name"),
                table_type: if t == "view" { "VIEW".to_string() } else { "BASE TABLE".to_string() },
                comment: None,
            }
        })
        .collect())
}

pub async fn get_columns(pool: &SqlitePool, _schema: &str, table: &str) -> Result<Vec<ColumnInfo>, String> {
    let rows: Vec<SqliteRow> =
        sqlx::query(&format!("PRAGMA table_info(\"{}\")", table)).fetch_all(pool).await.map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| ColumnInfo {
            name: row.get::<String, _>("name"),
            data_type: row.get::<String, _>("type"),
            is_nullable: row.get::<i32, _>("notnull") == 0,
            column_default: row.get::<Option<String>, _>("dflt_value"),
            is_primary_key: row.get::<i32, _>("pk") > 0,
            extra: None,
            comment: None,
            numeric_precision: None,
            numeric_scale: None,
            character_maximum_length: None,
        })
        .collect())
}

pub async fn list_indexes(pool: &SqlitePool, _schema: &str, table: &str) -> Result<Vec<IndexInfo>, String> {
    let safe_table = table.replace('"', "\"\"");
    let idx_rows: Vec<SqliteRow> = sqlx::query(&format!("PRAGMA index_list(\"{safe_table}\")"))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut indexes = Vec::new();
    for idx_row in &idx_rows {
        let name: String = idx_row.get("name");
        let is_unique: bool = idx_row.get::<i32, _>("unique") != 0;
        let origin: String = idx_row.get::<String, _>("origin");
        let is_primary = origin == "pk";

        let safe_name = name.replace('"', "\"\"");
        let col_rows: Vec<SqliteRow> = sqlx::query(&format!("PRAGMA index_info(\"{safe_name}\")"))
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

        let columns: Vec<String> = col_rows.iter().map(|r| r.get::<String, _>("name")).collect();

        indexes.push(IndexInfo {
            name,
            columns,
            is_unique,
            is_primary,
            filter: None,
            index_type: None,
            included_columns: None,
            comment: None,
        });
    }
    Ok(indexes)
}

pub async fn list_foreign_keys(pool: &SqlitePool, _schema: &str, table: &str) -> Result<Vec<ForeignKeyInfo>, String> {
    let rows: Vec<SqliteRow> = sqlx::query(&format!("PRAGMA foreign_key_list(\"{}\")", table))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| ForeignKeyInfo {
            name: format!("fk_{}", row.get::<i32, _>("id")),
            column: row.get::<String, _>("from"),
            ref_table: row.get::<String, _>("table"),
            ref_column: row.get::<String, _>("to"),
        })
        .collect())
}

pub async fn list_triggers(pool: &SqlitePool, _schema: &str, table: &str) -> Result<Vec<TriggerInfo>, String> {
    let rows: Vec<SqliteRow> =
        sqlx::query("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name")
            .bind(table)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|row| {
            let sql_text: String = row.get::<Option<String>, _>("sql").unwrap_or_default();
            let upper = sql_text.to_uppercase();
            let timing = if upper.contains("BEFORE") {
                "BEFORE"
            } else if upper.contains("AFTER") {
                "AFTER"
            } else {
                "INSTEAD OF"
            };
            let event = if upper.contains("INSERT") {
                "INSERT"
            } else if upper.contains("UPDATE") {
                "UPDATE"
            } else {
                "DELETE"
            };
            TriggerInfo { name: row.get::<String, _>("name"), event: event.to_string(), timing: timing.to_string() }
        })
        .collect())
}

pub async fn execute_query(pool: &SqlitePool, sql: &str) -> Result<QueryResult, String> {
    execute_query_with_max_rows(pool, sql, None).await
}

fn query_result_row_limit(max_rows: Option<usize>) -> usize {
    max_rows.unwrap_or(crate::query::MAX_ROWS).max(1)
}

/// Function-name rewrites for SQLite compatibility.
/// Keys are lowercase source names; values are replacement names.
/// Applied only at word boundaries followed by optional whitespace and `(`.
const SQLITE_FUNCTION_ALIASES: &[(&str, &str)] = &[("if", "IIF"), ("substring", "substr")];

/// Rewrites known non-SQLite function names (e.g. `if()` → `IIF()`, `substring()` → `substr()`)
/// before sending SQL to SQLite. Avoids modifying string literals, comments, and identifiers.
fn normalize_sqlite_sql(sql: &str) -> String {
    let mut result = String::with_capacity(sql.len());
    let chars: Vec<char> = sql.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if i + 1 < len && chars[i] == '-' && chars[i + 1] == '-' {
            while i < len && chars[i] != '\n' {
                result.push(chars[i]);
                i += 1;
            }
            continue;
        }

        if i + 1 < len && chars[i] == '/' && chars[i + 1] == '*' {
            while i + 1 < len && !(chars[i] == '*' && chars[i + 1] == '/') {
                result.push(chars[i]);
                i += 1;
            }
            if i + 1 < len {
                result.push(chars[i]);
                result.push(chars[i + 1]);
                i += 2;
            }
            continue;
        }

        if chars[i] == '\'' {
            result.push(chars[i]);
            i += 1;
            while i < len {
                if chars[i] == '\'' {
                    result.push('\'');
                    i += 1;
                    if i < len && chars[i] == '\'' {
                        result.push('\'');
                        i += 1;
                    } else {
                        break;
                    }
                } else {
                    result.push(chars[i]);
                    i += 1;
                }
            }
            continue;
        }

        let prev = if i == 0 { '\0' } else { chars[i - 1] };
        let boundary = !prev.is_alphanumeric() && prev != '_' && prev != '.';

        if boundary {
            let remaining: String = chars[i..].iter().collect();
            let remaining_lower = remaining.to_lowercase();

            let mut matched = false;
            for (source, replacement) in SQLITE_FUNCTION_ALIASES {
                if remaining_lower.starts_with(*source) && chars.get(i + source.len()) != Some(&'_') {
                    let mut j = i + source.len();
                    while j < len && chars[j].is_whitespace() {
                        j += 1;
                    }
                    if j < len && chars[j] == '(' {
                        let whitespace: String = chars[i + source.len()..j].iter().collect();
                        result.push_str(replacement);
                        result.push_str(&whitespace);
                        i = j;
                        matched = true;
                        break;
                    }
                }
            }
            if matched {
                continue;
            }
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

pub async fn execute_query_with_max_rows(
    pool: &SqlitePool,
    sql: &str,
    max_rows: Option<usize>,
) -> Result<QueryResult, String> {
    let start = Instant::now();
    let row_limit = query_result_row_limit(max_rows);
    let sql = normalize_sqlite_sql(sql);

    if starts_with_executable_sql_keyword(&sql, &["SELECT", "PRAGMA", "EXPLAIN", "WITH"]) {
        let desc = pool.describe(&sql).await.map_err(|e| e.to_string())?;
        let columns: Vec<String> = desc.columns().iter().map(|c| c.name().to_string()).collect();

        let mut stream = sqlx::query(&sql).fetch(pool);
        let mut result_rows: Vec<Vec<serde_json::Value>> = Vec::new();

        while let Some(row) = stream.next().await {
            let row = row.map_err(|e| e.to_string())?;
            result_rows.push(
                (0..row.len())
                    .map(|i| {
                        row.try_get::<String, _>(i)
                            .map(serde_json::Value::String)
                            .or_else(|_| row.try_get::<i64, _>(i).map(super::safe_i64_to_json))
                            .or_else(|_| {
                                row.try_get::<f64, _>(i).map(|v| {
                                    serde_json::Number::from_f64(v)
                                        .map(serde_json::Value::Number)
                                        .unwrap_or(serde_json::Value::Null)
                                })
                            })
                            .or_else(|_| row.try_get::<bool, _>(i).map(serde_json::Value::Bool))
                            .unwrap_or(serde_json::Value::Null)
                    })
                    .collect(),
            );
            if result_rows.len() > row_limit {
                break;
            }
        }

        let truncated = result_rows.len() > row_limit;
        if truncated {
            result_rows.truncate(row_limit);
        }

        Ok(QueryResult {
            columns,
            rows: result_rows,
            affected_rows: 0,
            execution_time_ms: start.elapsed().as_millis(),
            truncated,
            session_id: None,
            has_more: false,
        })
    } else {
        let result = sqlx::query(&sql).execute(pool).await.map_err(|e| e.to_string())?;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            affected_rows: result.rows_affected(),
            execution_time_ms: start.elapsed().as_millis(),
            truncated: false,
            session_id: None,
            has_more: false,
        })
    }
}
