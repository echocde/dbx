use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OperationClass {
    Read,
    Write,
    Ddl,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RiskMetadata {
    pub operation_class: OperationClass,
    pub risk_level: RiskLevel,
    pub is_production: bool,
    pub production_reason: Option<String>,
    pub first_token: Option<String>,
}

pub fn classify_sql(sql: &str) -> OperationClass {
    let token = first_executable_token(sql).map(|s| s.to_ascii_uppercase());
    match token.as_deref() {
        Some("SELECT" | "SHOW" | "DESCRIBE" | "EXPLAIN" | "WITH") => OperationClass::Read,
        Some("INSERT" | "UPDATE" | "DELETE" | "MERGE" | "REPLACE") => OperationClass::Write,
        Some("CREATE" | "ALTER" | "DROP" | "TRUNCATE" | "RENAME") => OperationClass::Ddl,
        _ => OperationClass::Unknown,
    }
}

pub fn risk_for(sql: &str, connection_name: &str, color: Option<&str>) -> RiskMetadata {
    let operation_class = classify_sql(sql);
    let (is_production, production_reason) = production_signal(connection_name, color);
    let risk_level = match (operation_class, is_production) {
        (OperationClass::Read, _) => RiskLevel::Low,
        (OperationClass::Write, false) => RiskLevel::Medium,
        (OperationClass::Write, true) => RiskLevel::High,
        (OperationClass::Ddl, _) => RiskLevel::Critical,
        (OperationClass::Unknown, _) => RiskLevel::High,
    };

    RiskMetadata {
        operation_class,
        risk_level,
        is_production,
        production_reason,
        first_token: first_executable_token(sql).map(str::to_string),
    }
}

fn production_signal(connection_name: &str, color: Option<&str>) -> (bool, Option<String>) {
    if matches!(color, Some("#ef4444")) {
        return (true, Some("red connection color".to_string()));
    }

    let name = connection_name.to_ascii_lowercase();
    if ["prod", "production", "live"]
        .iter()
        .any(|needle| name.contains(needle))
    {
        return (true, Some("connection name fallback".to_string()));
    }

    (false, None)
}

fn first_executable_token(sql: &str) -> Option<&str> {
    let bytes = sql.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }

        if i + 1 < bytes.len() && bytes[i] == b'-' && bytes[i + 1] == b'-' {
            i += 2;
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }

        if i + 1 < bytes.len() && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            continue;
        }

        break;
    }

    let start = i;
    while i < bytes.len() && (bytes[i].is_ascii_alphabetic() || bytes[i] == b'_') {
        i += 1;
    }

    (i > start).then_some(&sql[start..i])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comments_do_not_hide_read_token() {
        assert_eq!(classify_sql("-- comment\nSELECT 1"), OperationClass::Read);
        assert_eq!(classify_sql("/* DROP TABLE x */ SELECT 1"), OperationClass::Read);
    }

    #[test]
    fn classifies_write_and_ddl() {
        assert_eq!(
            classify_sql("update users set name = 'a'"),
            OperationClass::Write
        );
        assert_eq!(classify_sql("DROP TABLE users"), OperationClass::Ddl);
    }

    #[test]
    fn red_color_marks_production() {
        let risk = risk_for("SELECT * FROM orders", "prod-main", Some("#ef4444"));
        assert!(risk.is_production);
        assert_eq!(risk.risk_level, RiskLevel::Low);
    }
}
