import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const tasks = [
  {
    name: "format",
    command: "oxfmt",
    args: ["--check", "apps/desktop/src/**/*.{ts,vue}"],
  },
  {
    name: "lint",
    command: "oxlint",
    args: ["--vue-plugin", "apps/desktop/src"],
  },
  {
    name: "typecheck",
    command: "vue-tsc",
    args: ["--noEmit", "--project", "apps/desktop/tsconfig.json"],
  },
  {
    name: "test",
    command: "tsx",
    args: ["--tsconfig", "apps/desktop/tsconfig.json", "--test", "packages/app-tests/*.test.ts"],
  },
];

function runTask(task) {
  const startedAt = performance.now();
  const child = spawn(task.command, task.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];

  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  return new Promise((resolve) => {
    child.on("error", (error) => {
      resolve({
        ...task,
        code: 1,
        durationMs: performance.now() - startedAt,
        output: "",
        errorOutput: error.stack ?? String(error),
      });
    });

    child.on("close", (code) => {
      resolve({
        ...task,
        code,
        durationMs: performance.now() - startedAt,
        output: Buffer.concat(stdout).toString(),
        errorOutput: Buffer.concat(stderr).toString(),
      });
    });
  });
}

const results = await Promise.all(tasks.map(runTask));

for (const result of results) {
  const seconds = (result.durationMs / 1000).toFixed(2);
  const status = result.code === 0 ? "ok" : "failed";
  console.log(`${status.padEnd(6)} ${result.name.padEnd(9)} ${seconds}s`);
}

const failures = results.filter((result) => result.code !== 0);

for (const failure of failures) {
  console.error(`\n${failure.name} output:`);
  if (failure.output) {
    console.error(failure.output.trimEnd());
  }
  if (failure.errorOutput) {
    console.error(failure.errorOutput.trimEnd());
  }
}

if (failures.length > 0) {
  process.exit(1);
}
