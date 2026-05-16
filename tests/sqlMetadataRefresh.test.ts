import assert from "node:assert/strict";
import test from "node:test";
import { sqlMetadataRefreshScope } from "../src/lib/sqlMetadataRefresh.ts";

test("database DDL refreshes the connection database list", () => {
  assert.equal(sqlMetadataRefreshScope("CREATE DATABASE app;"), "connection");
  assert.equal(sqlMetadataRefreshScope("drop schema public cascade;"), "connection");
});

test("object DDL refreshes the selected database tree", () => {
  assert.equal(sqlMetadataRefreshScope("CREATE TABLE users (id int);"), "database");
  assert.equal(sqlMetadataRefreshScope("CREATE TEMP TABLE scratch (id int);"), "database");
  assert.equal(sqlMetadataRefreshScope("CREATE MATERIALIZED VIEW daily_users AS SELECT 1;"), "database");
  assert.equal(sqlMetadataRefreshScope("ALTER TABLE users ADD COLUMN name text;"), "database");
  assert.equal(sqlMetadataRefreshScope("DROP VIEW active_users;"), "database");
  assert.equal(
    sqlMetadataRefreshScope("CREATE OR REPLACE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE SQL;"),
    "database",
  );
});

test("data-only SQL does not refresh metadata trees", () => {
  assert.equal(sqlMetadataRefreshScope("SELECT * FROM users;"), "none");
  assert.equal(sqlMetadataRefreshScope("INSERT INTO users VALUES (1);"), "none");
  assert.equal(sqlMetadataRefreshScope("TRUNCATE TABLE users;"), "none");
});
