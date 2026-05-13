import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_AWARE_TYPES, TREE_SCHEMA_TYPES } from "../src/lib/databaseCapabilities.ts";

test("treats Trino catalogs as schema tree roots", () => {
  assert.equal(TREE_SCHEMA_TYPES.has("trino"), true);
});

test("treats Trino tables as schema-qualified SQL targets", () => {
  assert.equal(SCHEMA_AWARE_TYPES.has("trino"), true);
});
