use crate::models::connection::DatabaseType;

#[derive(Debug, Clone, Copy)]
pub struct TableSelectSqlOptions<'a> {
    pub database_type: Option<DatabaseType>,
    pub schema: Option<&'a str>,
    pub table_name: &'a str,
    pub columns: &'a [String],
    pub order_columns: &'a [String],
    pub limit: usize,
}

pub fn build_count_table_sql(database_type: Option<DatabaseType>, schema: Option<&str>, table_name: &str) -> String {
    format!("SELECT COUNT(*) AS row_count FROM {}", qualified_table_name(database_type, schema, table_name))
}

pub fn build_table_select_sql(options: TableSelectSqlOptions<'_>) -> String {
    let database_type = options.database_type;
    let table = qualified_table_name(database_type, options.schema, options.table_name);
    let select_columns = if options.columns.is_empty() {
        "*".to_string()
    } else {
        options
            .columns
            .iter()
            .map(|column| quote_table_identifier(database_type, column))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let order_by = if options.order_columns.is_empty() {
        String::new()
    } else {
        format!(
            " ORDER BY {}",
            options
                .order_columns
                .iter()
                .map(|column| format!("{} ASC", quote_table_identifier(database_type, column)))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    let limit = options.limit;

    if database_type.is_some_and(uses_fetch_first) {
        return format!("SELECT {select_columns} FROM {table}{order_by} FETCH FIRST {limit} ROWS ONLY");
    }

    if database_type == Some(DatabaseType::SqlServer) {
        return format!("SELECT TOP ({limit}) {select_columns} FROM {table}{order_by}");
    }

    format!("SELECT {select_columns} FROM {table}{order_by} LIMIT {limit};")
}

pub fn qualified_table_name(database_type: Option<DatabaseType>, schema: Option<&str>, table_name: &str) -> String {
    if database_type.is_some_and(is_schema_aware) && schema.is_some_and(|schema| !schema.trim().is_empty()) {
        return format!(
            "{}.{}",
            quote_table_identifier(database_type, schema.unwrap()),
            quote_table_identifier(database_type, table_name)
        );
    }
    quote_table_identifier(database_type, table_name)
}

pub fn quote_table_identifier(database_type: Option<DatabaseType>, name: &str) -> String {
    match database_type {
        Some(DatabaseType::Mysql | DatabaseType::Hive | DatabaseType::Tdengine | DatabaseType::Access) => {
            format!("`{}`", name.replace('`', "``"))
        }
        Some(DatabaseType::Informix) if is_simple_informix_identifier(name) => name.to_string(),
        Some(DatabaseType::Neo4j) => format!("`{}`", name.replace('`', "``")),
        Some(DatabaseType::SqlServer) => format!("[{}]", name.replace(']', "]]")),
        _ => format!("\"{}\"", name.replace('"', "\"\"")),
    }
}

pub fn is_schema_aware(database_type: DatabaseType) -> bool {
    matches!(
        database_type,
        DatabaseType::Postgres
            | DatabaseType::SqlServer
            | DatabaseType::Oracle
            | DatabaseType::Redshift
            | DatabaseType::Dameng
            | DatabaseType::Gaussdb
            | DatabaseType::Kingbase
            | DatabaseType::Highgo
            | DatabaseType::Vastbase
            | DatabaseType::Yashandb
            | DatabaseType::Databricks
            | DatabaseType::SapHana
            | DatabaseType::Teradata
            | DatabaseType::Vertica
            | DatabaseType::Exasol
            | DatabaseType::OpenGauss
            | DatabaseType::OceanbaseOracle
            | DatabaseType::Gbase
            | DatabaseType::Jdbc
            | DatabaseType::H2
            | DatabaseType::Snowflake
            | DatabaseType::Trino
            | DatabaseType::Db2
            | DatabaseType::Tdengine
    )
}

pub fn uses_fetch_first(database_type: DatabaseType) -> bool {
    matches!(database_type, DatabaseType::Oracle | DatabaseType::Dameng)
}

fn is_simple_informix_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_')
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '$')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_identifiers_by_database_type() {
        assert_eq!(quote_table_identifier(Some(DatabaseType::Mysql), "user`name"), "`user``name`");
        assert_eq!(quote_table_identifier(Some(DatabaseType::SqlServer), "user]name"), "[user]]name]");
        assert_eq!(quote_table_identifier(Some(DatabaseType::Postgres), "user\"name"), "\"user\"\"name\"");
        assert_eq!(quote_table_identifier(Some(DatabaseType::Informix), "users_1"), "users_1");
    }

    #[test]
    fn qualifies_schema_only_for_schema_aware_databases() {
        assert_eq!(qualified_table_name(Some(DatabaseType::Postgres), Some("public"), "users"), "\"public\".\"users\"");
        assert_eq!(qualified_table_name(Some(DatabaseType::Mysql), Some("public"), "users"), "`users`");
    }

    #[test]
    fn builds_select_sql_with_limit_syntax_for_database_type() {
        let columns = vec!["id".to_string(), "name".to_string()];
        let keys = vec!["id".to_string()];

        assert_eq!(
            build_table_select_sql(TableSelectSqlOptions {
                database_type: Some(DatabaseType::Postgres),
                schema: Some("public"),
                table_name: "users",
                columns: &columns,
                order_columns: &keys,
                limit: 100,
            }),
            "SELECT \"id\", \"name\" FROM \"public\".\"users\" ORDER BY \"id\" ASC LIMIT 100;"
        );
        assert_eq!(
            build_table_select_sql(TableSelectSqlOptions {
                database_type: Some(DatabaseType::SqlServer),
                schema: Some("dbo"),
                table_name: "users",
                columns: &columns,
                order_columns: &keys,
                limit: 100,
            }),
            "SELECT TOP (100) [id], [name] FROM [dbo].[users] ORDER BY [id] ASC"
        );
    }
}
