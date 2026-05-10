use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum CliErrorCode {
    GuiRuntimeRequired,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CliSource {
    GuiRuntime,
    Headless,
}

#[derive(Debug, Serialize)]
pub(crate) struct CliError {
    code: CliErrorCode,
    message: String,
    recoverable: bool,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum CliEnvelope<T> {
    Success { ok: bool, source: CliSource, data: T },
    Failure { ok: bool, source: CliSource, error: CliError },
}

pub(crate) async fn run(args: Vec<String>) -> Result<(), CliEnvelope<()>> {
    let output = match args.as_slice() {
        [cmd, ..] if cmd == "context" => context().await,
        [cmd, ..] if cmd == "selection" => runtime_required("dbx selection requires DBX GUI runtime."),
        [cmd, sub, ..] if cmd == "result" && sub == "current" => {
            runtime_required("dbx result current requires DBX GUI runtime.")
        }
        _ => ok(CliSource::Headless, serde_json::json!({ "runtime": "headless" })),
    };

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

async fn context() -> CliEnvelope<serde_json::Value> {
    match crate::runtime_client::get_json("/context").await {
        Ok(data) => ok(CliSource::GuiRuntime, data),
        Err(_) => ok(CliSource::Headless, serde_json::json!({ "runtime": "headless" })),
    }
}

fn ok<T>(source: CliSource, data: T) -> CliEnvelope<T> {
    CliEnvelope::Success { ok: true, source, data }
}

fn runtime_required(message: &str) -> CliEnvelope<serde_json::Value> {
    CliEnvelope::Failure {
        ok: false,
        source: CliSource::Headless,
        error: CliError { code: CliErrorCode::GuiRuntimeRequired, message: message.to_string(), recoverable: true },
    }
}
