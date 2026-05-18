#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const POM_PATH = "plugins/jdbc/pom.xml";
const MANIFEST_PATH = "plugins/jdbc/manifest.json";

function firstProjectVersion(pomXml) {
  const match = pomXml.match(/<project[\s\S]*?<version>([^<]+)<\/version>/);
  return match?.[1]?.trim() ?? "";
}

function manifestVersion(manifestJson) {
  return JSON.parse(manifestJson).version ?? "";
}

function isRelevantJdbcPluginChange(file) {
  if (!file.startsWith("plugins/jdbc/")) return false;
  if (file.startsWith("plugins/jdbc/dist/") || file.startsWith("plugins/jdbc/target/")) return false;
  if (file === "plugins/jdbc/README.md" || file === "plugins/jdbc/package.sh") return false;
  return true;
}

export function evaluateJdbcPluginVersionChange({
  changedFiles,
  basePomVersion,
  baseManifestVersion,
  headPomVersion,
  headManifestVersion,
}) {
  const errors = [];
  if (headPomVersion !== headManifestVersion) {
    errors.push(`JDBC plugin version mismatch: pom.xml is ${headPomVersion} but manifest.json is ${headManifestVersion}.`);
    return errors;
  }

  const baseVersion = basePomVersion || baseManifestVersion;
  const relevantChanged = changedFiles.some(isRelevantJdbcPluginChange);
  if (relevantChanged && headPomVersion === baseVersion) {
    errors.push(
      `JDBC plugin files changed, but the plugin version is still ${headPomVersion}. Bump plugins/jdbc/pom.xml and plugins/jdbc/manifest.json.`,
    );
  }
  return errors;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readFileAt(ref, path) {
  return git(["show", `${ref}:${path}`]);
}

function main() {
  const [baseRef = "HEAD~1", headRef = "HEAD"] = process.argv.slice(2);
  const changedFiles = git(["diff", "--name-only", baseRef, headRef]).split("\n").filter(Boolean);
  const basePomVersion = firstProjectVersion(readFileAt(baseRef, POM_PATH));
  const baseManifestVersion = manifestVersion(readFileAt(baseRef, MANIFEST_PATH));
  const headPomVersion = firstProjectVersion(readFileAt(headRef, POM_PATH));
  const headManifestVersion = manifestVersion(readFileAt(headRef, MANIFEST_PATH));
  const errors = evaluateJdbcPluginVersionChange({
    changedFiles,
    basePomVersion,
    baseManifestVersion,
    headPomVersion,
    headManifestVersion,
  });

  if (errors.length) {
    for (const error of errors) {
      console.error(`::error::${error}`);
    }
    process.exit(1);
  }
  console.log(`JDBC plugin version check passed (${headPomVersion}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
