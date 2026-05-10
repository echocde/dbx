use dbx_core::cli::{fail, ok, CliEnvelope, CliErrorCode, CliSource};

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

fn runtime_required(message: &str) -> CliEnvelope<serde_json::Value> {
    fail(CliSource::Headless, CliErrorCode::GuiRuntimeRequired, message, true)
}
