import { strict as assert } from "node:assert";
import test from "node:test";
import { evaluateJdbcPluginVersionChange } from "../../.github/scripts/check-jdbc-plugin-version.mjs";

test("requires a JDBC plugin version bump when runtime files change", () => {
  assert.deepEqual(
    evaluateJdbcPluginVersionChange({
      changedFiles: ["plugins/jdbc/src/main/java/app/dbx/jdbc/DbxJdbcPlugin.java"],
      basePomVersion: "0.1.1",
      baseManifestVersion: "0.1.1",
      headPomVersion: "0.1.1",
      headManifestVersion: "0.1.1",
    }),
    ["JDBC plugin files changed, but the plugin version is still 0.1.1. Bump plugins/jdbc/pom.xml and plugins/jdbc/manifest.json."],
  );
});

test("allows JDBC plugin runtime changes when pom and manifest versions are bumped together", () => {
  assert.deepEqual(
    evaluateJdbcPluginVersionChange({
      changedFiles: ["plugins/jdbc/src/main/java/app/dbx/jdbc/DbxJdbcPlugin.java"],
      basePomVersion: "0.1.1",
      baseManifestVersion: "0.1.1",
      headPomVersion: "0.1.2",
      headManifestVersion: "0.1.2",
    }),
    [],
  );
});

test("does not require a JDBC plugin version bump for docs or release packaging changes", () => {
  assert.deepEqual(
    evaluateJdbcPluginVersionChange({
      changedFiles: ["plugins/jdbc/README.md", "plugins/jdbc/package.sh"],
      basePomVersion: "0.1.1",
      baseManifestVersion: "0.1.1",
      headPomVersion: "0.1.1",
      headManifestVersion: "0.1.1",
    }),
    [],
  );
});

test("requires JDBC plugin pom and manifest versions to match", () => {
  assert.deepEqual(
    evaluateJdbcPluginVersionChange({
      changedFiles: ["plugins/jdbc/manifest.json"],
      basePomVersion: "0.1.1",
      baseManifestVersion: "0.1.1",
      headPomVersion: "0.1.2",
      headManifestVersion: "0.1.1",
    }),
    ["JDBC plugin version mismatch: pom.xml is 0.1.2 but manifest.json is 0.1.1."],
  );
});
