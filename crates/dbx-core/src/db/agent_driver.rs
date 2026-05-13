use std::io::{BufRead, BufReader, BufWriter, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde_json::Value;

const RPC_TIMEOUT_SECS: u64 = 30;
const STARTUP_TIMEOUT_SECS: u64 = 15;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct AgentDriverClient {
    child: Child,
    stdin: Option<BufWriter<ChildStdin>>,
    stdout: Option<BufReader<ChildStdout>>,
    next_id: u64,
}

impl AgentDriverClient {
    /// Spawn a Java agent process and wait for it to signal readiness.
    ///
    /// The agent is started via `java -jar <jar_path>` with stdin/stdout piped.
    /// Blocks (async) until the agent writes `{"ready":true}` to stdout.
    pub async fn spawn(java_path: &str, jar_path: &str) -> Result<Self, String> {
        let mut command = Command::new(java_path);
        command
            .args([
                "-Dfile.encoding=UTF-8",
                "-Dsun.stdout.encoding=UTF-8",
                "-Dsun.stderr.encoding=UTF-8",
                "-XX:TieredStopAtLevel=1",
                "-XX:+UseSerialGC",
                "-jar",
                jar_path,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command.spawn().map_err(|e| format!("Failed to spawn agent process: {e}"))?;

        let child_stdin = child.stdin.take().ok_or("Failed to capture agent stdin")?;
        let child_stdout = child.stdout.take().ok_or("Failed to capture agent stdout")?;

        let stdin = BufWriter::new(child_stdin);
        let mut stdout = BufReader::new(child_stdout);

        // Wait for the agent to signal readiness with {"ready":true}
        let ready_stdout = tokio::time::timeout(
            Duration::from_secs(STARTUP_TIMEOUT_SECS),
            tokio::task::spawn_blocking(move || {
                let line = read_agent_line(&mut stdout, "startup line")?;
                let v: Value = serde_json::from_str(line.trim())
                    .map_err(|e| format!("Invalid JSON from agent during startup: {e}"))?;
                if v.get("ready") != Some(&Value::Bool(true)) {
                    return Err(format!("Agent did not send ready signal, got: {line}"));
                }
                Ok(stdout)
            }),
        )
        .await
        .map_err(|_| format!("Agent startup timed out ({STARTUP_TIMEOUT_SECS}s)"))?
        .map_err(|e| format!("Agent startup task failed: {e}"))??;

        Ok(Self { child, stdin: Some(stdin), stdout: Some(ready_stdout), next_id: 0 })
    }

    /// Send a JSON-RPC 2.0 request and wait for the response.
    pub async fn call<T: DeserializeOwned + Send + 'static>(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<T, String> {
        self.next_id += 1;
        let id = self.next_id;

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let request_line =
            serde_json::to_string(&request).map_err(|e| format!("Failed to serialize JSON-RPC request: {e}"))?;

        // Write request to stdin
        {
            let writer = self.stdin.as_mut().ok_or("Agent stdin not available")?;
            writer.write_all(request_line.as_bytes()).map_err(|e| format!("Failed to write to agent stdin: {e}"))?;
            writer.write_all(b"\n").map_err(|e| format!("Failed to write newline to agent stdin: {e}"))?;
            writer.flush().map_err(|e| format!("Failed to flush agent stdin: {e}"))?;
        }

        // Read response from stdout (blocking, with timeout)
        let mut reader = self.stdout.take().ok_or("Agent stdout not available")?;

        let (returned_reader, result) = tokio::time::timeout(
            Duration::from_secs(RPC_TIMEOUT_SECS),
            tokio::task::spawn_blocking(move || {
                let line = match read_agent_line(&mut reader, "response") {
                    Ok(line) => line,
                    Err(e) => return (reader, Err(e)),
                };

                let resp: Value = match serde_json::from_str(line.trim()) {
                    Ok(v) => v,
                    Err(e) => {
                        return (reader, Err(format!("Invalid JSON response from agent: {e}")));
                    }
                };

                let result = if let Some(err) = resp.get("error") {
                    let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown agent error");
                    let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
                    Err(format!("Agent RPC error ({code}): {msg}"))
                } else if let Some(result_val) = resp.get("result") {
                    serde_json::from_value::<T>(result_val.clone())
                        .map_err(|e| format!("Failed to deserialize agent result: {e}"))
                } else {
                    Err(format!("Agent response missing both 'result' and 'error': {line}"))
                };

                (reader, result)
            }),
        )
        .await
        .map_err(|_| format!("Agent RPC call timed out ({RPC_TIMEOUT_SECS}s)"))?
        .map_err(|e| format!("Agent RPC task failed: {e}"))?;

        let _ = self.stdout.insert(returned_reader);
        result
    }

    /// Send a shutdown message to the agent and wait for the process to exit.
    pub async fn shutdown(&mut self) {
        // Try to send a shutdown RPC; ignore errors if the agent is already gone
        let shutdown_result: Result<Value, String> = self.call("shutdown", Value::Null).await;
        if let Err(e) = &shutdown_result {
            log::warn!("Agent shutdown RPC failed: {e}");
        }

        // Drop stdin to signal EOF
        self.stdin.take();

        // Wait for the child to exit
        match self.child.wait() {
            Ok(status) => log::info!("Agent process exited with {status}"),
            Err(e) => log::warn!("Failed to wait for agent process: {e}"),
        }
    }

    /// Forcefully kill the agent process.
    pub fn kill(&mut self) {
        self.stdin.take();
        self.stdout.take();
        if let Err(e) = self.child.kill() {
            log::warn!("Failed to kill agent process: {e}");
        }
        // Reap the child to avoid zombie processes
        let _ = self.child.wait();
    }
}

fn read_agent_line<R: BufRead>(reader: &mut R, context: &str) -> Result<String, String> {
    let mut bytes = Vec::new();
    reader.read_until(b'\n', &mut bytes).map_err(|e| format!("Failed to read {context} from agent: {e}"))?;
    if bytes.is_empty() {
        return Err(format!("Failed to read {context} from agent: end of stream"));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

impl Drop for AgentDriverClient {
    fn drop(&mut self) {
        self.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::read_agent_line;
    use std::io::Cursor;

    #[test]
    fn decodes_non_utf8_agent_lines_lossily() {
        let mut reader =
            Cursor::new(vec![b'{', b'"', b'e', b'r', b'r', b'o', b'r', b'"', b':', 0xB2, 0xE2, b'}', b'\n']);

        let line = read_agent_line(&mut reader, "response").expect("line should be readable");

        assert_eq!(line, format!("{{\"error\":{}}}\n", "\u{fffd}\u{fffd}"));
    }
}
