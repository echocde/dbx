use dbx_core::cli::{fail, ok, CliEnvelope, CliErrorCode, CliSource};

const DEFAULT_RESULT_LIMIT: u32 = 50;
const MAX_RESULT_LIMIT: u32 = 1000;

pub(crate) async fn run(args: Vec<String>) -> Result<(), CliEnvelope<()>> {
    let output = dispatch(args).await;
    println!("{}", serde_json::to_string_pretty(&output).unwrap());

    if matches!(output, CliEnvelope::Failure { .. }) {
        std::process::exit(1);
    }

    Ok(())
}

pub(crate) async fn dispatch(args: Vec<String>) -> CliEnvelope<serde_json::Value> {
    let parsed = match parse_args(args) {
        Ok(parsed) => parsed,
        Err(err) => return err,
    };

    match parsed.positionals.as_slice() {
        [cmd, rest @ ..] if cmd == "context" => context(rest).await,
        [cmd, sub, rest @ ..] if cmd == "conn" && sub == "list" => conn_list(rest).await,
        [cmd, sub, name, rest @ ..] if cmd == "conn" && sub == "show" => conn_show(name, rest).await,
        [cmd, sub, rest @ ..] if cmd == "schema" && sub == "snapshot" => schema_snapshot(rest).await,
        [cmd, rest @ ..] if cmd == "safe-query" => safe_query(rest).await,
        [cmd, rest @ ..] if cmd == "handoff" => handoff(rest).await,
        [cmd, rest @ ..] if cmd == "selection" => selection(rest).await,
        [cmd, sub, rest @ ..] if cmd == "result" && sub == "current" => result_current(rest).await,
        _ => fail(CliSource::Headless, CliErrorCode::InternalError, "Unknown command", false),
    }
}

struct ParsedArgs {
    positionals: Vec<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum FlagKind {
    Value,
    Bool,
}

#[derive(Clone, Copy)]
struct FlagSpec {
    kind: FlagKind,
    allow_dash_value: bool,
}

fn parse_args(args: Vec<String>) -> Result<ParsedArgs, CliEnvelope<serde_json::Value>> {
    let mut positionals = Vec::new();
    let mut index = 0;

    while index < args.len() {
        let arg = &args[index];
        if arg == "--format" {
            let Some(value) = args.get(index + 1) else {
                return Err(invalid_args(format!("{arg} requires a value")));
            };
            if value != "json" {
                return Err(invalid_args("Only --format json is supported"));
            }
            index += 2;
        } else if arg.starts_with("--") {
            let Some(spec) =
                flag_spec(positionals.first().map(String::as_str), positionals.get(1).map(String::as_str), arg)
            else {
                return Err(invalid_args(format!("Unknown flag: {arg}")));
            };

            if spec.kind == FlagKind::Value {
                let Some(value) = args.get(index + 1) else {
                    return Err(invalid_args(format!("{arg} requires a value")));
                };
                if !spec.allow_dash_value && value.starts_with("--") {
                    return Err(invalid_args(format!("{arg} requires a value")));
                }
                positionals.push(arg.clone());
                positionals.push(value.clone());
                index += 2;
            } else {
                positionals.push(arg.clone());
                index += 1;
            }
        } else {
            positionals.push(arg.clone());
            index += 1;
        }
    }

    Ok(ParsedArgs { positionals })
}

fn flag_spec(command: Option<&str>, subcommand: Option<&str>, flag: &str) -> Option<FlagSpec> {
    let value = FlagKind::Value;
    let boolean = FlagKind::Bool;
    let normal_value = FlagSpec { kind: value, allow_dash_value: false };
    let free_text_value = FlagSpec { kind: value, allow_dash_value: true };
    let boolean_flag = FlagSpec { kind: boolean, allow_dash_value: false };

    match (command, subcommand, flag) {
        (Some("conn"), Some("show"), "--redacted") => Some(boolean_flag),
        (Some("schema"), Some("snapshot"), "--conn" | "--db") => Some(normal_value),
        (Some("safe-query"), _, "--conn" | "--db") => Some(normal_value),
        (Some("safe-query"), _, "--sql") => Some(free_text_value),
        (Some("handoff"), _, "--conn" | "--sql-file") => Some(normal_value),
        (Some("handoff"), _, "--title" | "--sql" | "--description") => Some(free_text_value),
        (Some("result"), Some("current"), "--limit") => Some(normal_value),
        _ => None,
    }
}

fn reject_unexpected_positionals(
    args: &[String],
    command: &str,
    subcommand: Option<&str>,
) -> Result<(), CliEnvelope<serde_json::Value>> {
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        let Some(spec) = flag_spec(Some(command), subcommand, arg) else {
            return Err(invalid_args(format!("Unexpected positional argument: {arg}")));
        };

        index += match spec.kind {
            FlagKind::Value => 2,
            FlagKind::Bool => 1,
        };
    }
    Ok(())
}

async fn context(args: &[String]) -> CliEnvelope<serde_json::Value> {
    if let Err(err) = reject_unexpected_positionals(args, "context", None) {
        return err;
    }

    match crate::runtime_client::get_json("/context").await {
        Ok(data) => ok(CliSource::GuiRuntime, data),
        Err(_) => ok(CliSource::Headless, serde_json::json!({ "runtime": "headless" })),
    }
}

async fn conn_list(args: &[String]) -> CliEnvelope<serde_json::Value> {
    if let Err(err) = reject_unexpected_positionals(args, "conn", Some("list")) {
        return err;
    }

    ok(CliSource::Headless, serde_json::json!({ "connections": [] }))
}

async fn conn_show(_name: &str, args: &[String]) -> CliEnvelope<serde_json::Value> {
    if let Err(err) = reject_unexpected_positionals(args, "conn", Some("show")) {
        return err;
    }

    ok(CliSource::Headless, serde_json::json!({}))
}

async fn schema_snapshot(args: &[String]) -> CliEnvelope<serde_json::Value> {
    if let Err(err) = reject_unexpected_positionals(args, "schema", Some("snapshot")) {
        return err;
    }

    let Some(_conn) = option_value(args, "--conn") else {
        return fail(CliSource::Headless, CliErrorCode::ConnectionNotFound, "--conn is required", true);
    };

    fail(
        CliSource::Headless,
        CliErrorCode::InternalError,
        "Schema snapshot headless execution is not implemented",
        true,
    )
}

async fn safe_query(args: &[String]) -> CliEnvelope<serde_json::Value> {
    if let Err(err) = reject_unexpected_positionals(args, "safe-query", None) {
        return err;
    }

    let Some(_conn) = option_value(args, "--conn") else {
        return fail(CliSource::Headless, CliErrorCode::ConnectionNotFound, "--conn is required", true);
    };
    let Some(_sql) = option_value(args, "--sql") else {
        return fail(CliSource::Headless, CliErrorCode::QueryClassificationFailed, "--sql is required", true);
    };

    fail(CliSource::Headless, CliErrorCode::InternalError, "Safe query headless execution is not implemented", true)
}

async fn handoff(args: &[String]) -> CliEnvelope<serde_json::Value> {
    if let Err(err) = reject_unexpected_positionals(args, "handoff", None) {
        return err;
    }

    let Some(conn) = required_option(args, "--conn") else {
        return invalid_args("--conn is required");
    };
    let Some(title) = required_option(args, "--title") else {
        return invalid_args("--title is required");
    };
    let sql_inline = option_value(args, "--sql");
    let sql_file = option_value(args, "--sql-file");
    let sql = match (sql_inline, sql_file) {
        (Some(_), Some(_)) => return invalid_args("Use exactly one of --sql or --sql-file"),
        (Some(sql), None) => sql.to_string(),
        (None, Some(path)) => match std::fs::read_to_string(path) {
            Ok(sql) => sql,
            Err(err) => return invalid_args(format!("Failed to read --sql-file: {err}")),
        },
        (None, None) => return invalid_args("Use exactly one of --sql or --sql-file"),
    };

    if sql.trim().is_empty() {
        return invalid_args("SQL must not be empty");
    }

    let risk = dbx_core::sql_safety::risk_for_connection(&sql, conn, None);
    let item = dbx_core::handoff::HandoffItem::queued(
        conn.to_string(),
        conn.to_string(),
        None,
        title.to_string(),
        option_value(args, "--description").map(str::to_string),
        sql,
        risk.operation_class,
        risk.risk_level,
        risk.is_production,
    );

    if let Ok(data) = crate::runtime_client::post_json("/handoff", serde_json::to_value(&item).unwrap()).await {
        return ok(CliSource::GuiRuntime, data);
    }

    match queue_handoff(&item).await {
        Ok(()) => ok(CliSource::Headless, serde_json::json!({ "id": item.id, "status": "queued" })),
        Err(err) => fail(CliSource::Headless, CliErrorCode::InternalError, err, false),
    }
}

async fn selection(args: &[String]) -> CliEnvelope<serde_json::Value> {
    if let Err(err) = reject_unexpected_positionals(args, "selection", None) {
        return err;
    }

    match crate::runtime_client::get_json("/selection").await {
        Ok(data) => ok(CliSource::GuiRuntime, data),
        Err(_) => runtime_required("dbx selection requires DBX GUI runtime."),
    }
}

async fn result_current(args: &[String]) -> CliEnvelope<serde_json::Value> {
    if let Err(err) = reject_unexpected_positionals(args, "result", Some("current")) {
        return err;
    }

    let limit = match parse_result_limit(args) {
        Ok(limit) => limit,
        Err(err) => return err,
    };

    match crate::runtime_client::get_json_with_query("/result/current", &[("limit", limit.to_string())]).await {
        Ok(data) => ok(CliSource::GuiRuntime, data),
        Err(_) => runtime_required("dbx result current requires DBX GUI runtime."),
    }
}

fn runtime_required(message: &str) -> CliEnvelope<serde_json::Value> {
    fail(CliSource::Headless, CliErrorCode::GuiRuntimeRequired, message, true)
}

fn invalid_args(message: impl Into<String>) -> CliEnvelope<serde_json::Value> {
    fail(CliSource::Headless, CliErrorCode::InternalError, message, true)
}

fn option_value<'a>(args: &'a [String], key: &str) -> Option<&'a str> {
    args.windows(2).find(|pair| pair[0] == key).map(|pair| pair[1].as_str())
}

fn required_option<'a>(args: &'a [String], key: &str) -> Option<&'a str> {
    option_value(args, key).map(str::trim).filter(|value| !value.is_empty())
}

fn parse_result_limit(args: &[String]) -> Result<u32, CliEnvelope<serde_json::Value>> {
    let default_limit = DEFAULT_RESULT_LIMIT.to_string();
    let raw = option_value(args, "--limit").unwrap_or(&default_limit);
    let limit = raw
        .parse::<u32>()
        .map_err(|_| invalid_args(format!("--limit must be a positive integer between 1 and {MAX_RESULT_LIMIT}")))?;
    if !(1..=MAX_RESULT_LIMIT).contains(&limit) {
        return Err(invalid_args(format!("--limit must be a positive integer between 1 and {MAX_RESULT_LIMIT}")));
    }
    Ok(limit)
}

async fn queue_handoff(item: &dbx_core::handoff::HandoffItem) -> Result<(), String> {
    let app_dir = crate::runtime_client::app_data_dir();
    std::fs::create_dir_all(&app_dir).map_err(|err| err.to_string())?;
    let storage = dbx_core::storage::Storage::open(&app_dir.join("dbx.db")).await?;
    storage.save_handoff(item).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_client::ENV_LOCK;
    use dbx_core::cli::CliErrorCode;

    fn assert_failure_code(env: CliEnvelope<serde_json::Value>, expected: CliErrorCode) {
        match env {
            CliEnvelope::Failure { error, .. } => assert_eq!(error.code, expected),
            CliEnvelope::Success { .. } => panic!("expected failure envelope"),
        }
    }

    fn assert_failure_message_contains(env: CliEnvelope<serde_json::Value>, expected: &str) {
        match env {
            CliEnvelope::Failure { error, .. } => assert!(
                error.message.contains(expected),
                "expected error message to contain {expected:?}, got {:?}",
                error.message
            ),
            CliEnvelope::Success { .. } => panic!("expected failure envelope"),
        }
    }

    #[test]
    fn parser_allows_free_text_option_values_to_start_with_dashes() {
        let parsed = parse_args(vec![
            "handoff".into(),
            "--conn".into(),
            "local".into(),
            "--title".into(),
            "-- review generated SQL".into(),
            "--sql".into(),
            "-- explain select 1".into(),
            "--description".into(),
            "-- optional note".into(),
        ])
        .expect("free-text values beginning with -- should parse");

        assert_eq!(
            parsed.positionals,
            vec![
                "handoff",
                "--conn",
                "local",
                "--title",
                "-- review generated SQL",
                "--sql",
                "-- explain select 1",
                "--description",
                "-- optional note",
            ]
        );
    }

    #[test]
    fn parser_accepts_global_json_format_before_between_and_after_command_args() {
        let cases = [
            vec!["--format", "json", "safe-query", "--conn", "local", "--sql", "select 1"],
            vec!["safe-query", "--conn", "local", "--format", "json", "--sql", "select 1"],
            vec!["safe-query", "--conn", "local", "--sql", "select 1", "--format", "json"],
        ];

        for args in cases {
            let parsed = parse_args(args.iter().map(|value| value.to_string()).collect())
                .unwrap_or_else(|err| panic!("expected parse success for {args:?}, got {err:?}"));
            assert_eq!(parsed.positionals, vec!["safe-query", "--conn", "local", "--sql", "select 1"]);
        }
    }

    #[tokio::test]
    async fn rejects_extra_positionals_for_each_command() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::env::set_var("DBX_APP_DATA_DIR", dir.path());

        let cases = [
            vec!["context", "extra"],
            vec!["conn", "list", "extra"],
            vec!["conn", "show", "local", "extra"],
            vec!["schema", "snapshot", "--conn", "local", "extra"],
            vec!["safe-query", "--conn", "local", "--sql", "select 1", "extra"],
            vec!["handoff", "--conn", "local", "--title", "Review", "--sql", "select 1", "extra"],
            vec!["selection", "extra"],
            vec!["result", "current", "--limit", "50", "extra"],
        ];

        for args in cases {
            let env = dispatch(args.iter().map(|value| value.to_string()).collect()).await;
            assert_failure_message_contains(env, "Unexpected positional argument");
        }

        std::env::remove_var("DBX_APP_DATA_DIR");
    }

    #[tokio::test]
    async fn gui_only_commands_return_runtime_required_without_runtime() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::env::set_var("DBX_APP_DATA_DIR", dir.path());

        assert_failure_code(
            dispatch(vec!["selection".into(), "--format".into(), "json".into()]).await,
            CliErrorCode::GuiRuntimeRequired,
        );
        assert_failure_code(
            dispatch(vec![
                "result".into(),
                "current".into(),
                "--limit".into(),
                "25".into(),
                "--format".into(),
                "json".into(),
            ])
            .await,
            CliErrorCode::GuiRuntimeRequired,
        );

        std::env::remove_var("DBX_APP_DATA_DIR");
    }

    #[tokio::test]
    async fn recognizes_all_eight_cli_commands_with_json_format() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::env::set_var("DBX_APP_DATA_DIR", dir.path());

        let cases = [
            vec!["context", "--format", "json"],
            vec!["conn", "list", "--format", "json"],
            vec!["conn", "show", "__missing__", "--redacted", "--format", "json"],
            vec!["schema", "snapshot", "--format", "json"],
            vec!["safe-query", "--format", "json"],
            vec!["handoff", "--format", "json"],
            vec!["selection", "--format", "json"],
            vec!["result", "current", "--limit", "50", "--format", "json"],
        ];

        for args in cases {
            let env = dispatch(args.iter().map(|value| value.to_string()).collect()).await;
            let json = serde_json::to_value(&env).unwrap();
            assert!(json.get("ok").is_some(), "missing ok for args: {args:?}");
            assert!(json.get("source").is_some(), "missing source for args: {args:?}");
            assert!(json.get("data").is_some() || json.get("error").is_some(), "missing data/error for args: {args:?}");
        }

        std::env::remove_var("DBX_APP_DATA_DIR");
    }

    #[tokio::test]
    async fn unknown_command_returns_internal_error_envelope() {
        assert_failure_code(
            dispatch(vec!["not-a-command".into(), "--format".into(), "json".into()]).await,
            CliErrorCode::InternalError,
        );
    }

    #[tokio::test]
    async fn rejects_non_json_format() {
        assert_failure_code(
            dispatch(vec!["context".into(), "--format".into(), "text".into()]).await,
            CliErrorCode::InternalError,
        );
    }

    #[tokio::test]
    async fn rejects_unknown_flags_with_error_envelope() {
        assert_failure_code(
            dispatch(vec!["context".into(), "--unknown".into(), "value".into()]).await,
            CliErrorCode::InternalError,
        );
    }

    #[tokio::test]
    async fn rejects_missing_option_values_with_error_envelope() {
        assert_failure_code(
            dispatch(vec!["safe-query".into(), "--conn".into(), "--sql".into(), "select 1".into()]).await,
            CliErrorCode::InternalError,
        );
    }

    #[tokio::test]
    async fn validates_handoff_required_options_and_sql_source() {
        assert_failure_code(
            dispatch(vec!["handoff".into(), "--title".into(), "Review".into(), "--sql".into(), "select 1".into()])
                .await,
            CliErrorCode::InternalError,
        );
        assert_failure_code(
            dispatch(vec!["handoff".into(), "--conn".into(), "local".into(), "--sql".into(), "select 1".into()]).await,
            CliErrorCode::InternalError,
        );
        assert_failure_code(
            dispatch(vec![
                "handoff".into(),
                "--conn".into(),
                "local".into(),
                "--title".into(),
                "Review".into(),
                "--sql".into(),
                "select 1".into(),
                "--sql-file".into(),
                "query.sql".into(),
            ])
            .await,
            CliErrorCode::InternalError,
        );
    }

    #[tokio::test]
    async fn handoff_queues_sql_file_when_runtime_is_unavailable() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let sql_file = dir.path().join("query.sql");
        std::fs::write(&sql_file, "select 1").unwrap();
        std::env::set_var("DBX_APP_DATA_DIR", dir.path());

        let env = dispatch(vec![
            "handoff".into(),
            "--conn".into(),
            "local".into(),
            "--title".into(),
            "Review".into(),
            "--sql-file".into(),
            sql_file.display().to_string(),
        ])
        .await;

        match env {
            CliEnvelope::Success { source, data, .. } => {
                assert_eq!(source, CliSource::Headless);
                assert_eq!(data["status"], "queued");
            }
            CliEnvelope::Failure { error, .. } => panic!("expected queued handoff, got {error:?}"),
        }

        std::env::remove_var("DBX_APP_DATA_DIR");
    }

    #[tokio::test]
    async fn result_current_rejects_non_positive_and_over_limit_values() {
        for limit in ["0", "-1", "1001", "abc"] {
            assert_failure_code(
                dispatch(vec!["result".into(), "current".into(), "--limit".into(), limit.into()]).await,
                CliErrorCode::InternalError,
            );
        }
    }
}
