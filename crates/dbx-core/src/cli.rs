use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CliSource {
    GuiRuntime,
    Headless,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CliErrorCode {
    GuiRuntimeRequired,
    ConnectionNotFound,
    AmbiguousConnection,
    SecretUnavailable,
    SshTunnelFailed,
    QueryClassificationFailed,
    HandoffRequired,
    DdlBlocked,
    ProductionWriteBlocked,
    UnsupportedDatabaseType,
    Timeout,
    InternalError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliError {
    pub code: CliErrorCode,
    pub message: String,
    pub recoverable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CliEnvelope<T> {
    Success { ok: bool, source: CliSource, data: T },
    Failure { ok: bool, source: CliSource, error: CliError },
}

pub fn ok<T>(source: CliSource, data: T) -> CliEnvelope<T> {
    CliEnvelope::Success { ok: true, source, data }
}

pub fn fail<T>(source: CliSource, code: CliErrorCode, message: impl Into<String>, recoverable: bool) -> CliEnvelope<T> {
    CliEnvelope::Failure { ok: false, source, error: CliError { code, message: message.into(), recoverable } }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_success_source_as_kebab_case() {
        let env = ok(CliSource::GuiRuntime, serde_json::json!({"value": 1}));
        let json = serde_json::to_string(&env).unwrap();
        assert!(json.contains("\"ok\":true"));
        assert!(json.contains("\"source\":\"gui-runtime\""));
    }

    #[test]
    fn serializes_error_code_as_screaming_snake_case() {
        let env: CliEnvelope<()> = fail(CliSource::Headless, CliErrorCode::GuiRuntimeRequired, "runtime needed", true);
        let json = serde_json::to_string(&env).unwrap();
        assert!(json.contains("\"GUI_RUNTIME_REQUIRED\""));
    }
}
