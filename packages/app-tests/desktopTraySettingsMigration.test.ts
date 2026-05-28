import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("desktop settings fall back to the legacy run_in_background preference during upgrades", () => {
  const source = readFileSync("crates/dbx-core/src/storage.rs", "utf8");

  assert.match(source, /\.or_else\(\|\| settings\.get\("run_in_background"\)\.and_then\(\|value\| value\.as_bool\(\)\)\)/);
});
