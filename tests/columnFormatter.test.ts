import { strict as assert } from "node:assert";
import test from "node:test";
import {
  applyColumnFormatter,
  buildColumnFormatterKey,
  normalizeColumnFormatter,
  type ColumnFormatterConfig,
} from "../src/lib/columnFormatter.ts";

test("formats unix timestamps in seconds, milliseconds, and auto mode", () => {
  assert.equal(
    applyColumnFormatter(1715758200, { kind: "datetime", unit: "seconds" }),
    new Date(1715758200 * 1000).toLocaleString(),
  );
  assert.equal(
    applyColumnFormatter(1715758200000, { kind: "datetime", unit: "milliseconds" }),
    new Date(1715758200000).toLocaleString(),
  );
  assert.equal(
    applyColumnFormatter("1715758200", { kind: "datetime", unit: "auto" }),
    new Date(1715758200 * 1000).toLocaleString(),
  );
});

test("extracts simple JSON paths from object and array strings", () => {
  const payload = JSON.stringify({ user: { name: "Ada" }, items: [{ id: 7 }] });

  assert.equal(applyColumnFormatter(payload, { kind: "json-path", path: "$.user.name" }), "Ada");
  assert.equal(applyColumnFormatter(payload, { kind: "json-path", path: "$.items[0].id" }), "7");
  assert.equal(applyColumnFormatter(payload, { kind: "json-path", path: "$.missing" }), "");
});

test("masks strings while preserving prefix and suffix", () => {
  assert.equal(applyColumnFormatter("abcdef123456", { kind: "mask", prefix: 3, suffix: 2 }), "abc*******56");
  assert.equal(applyColumnFormatter("short", { kind: "mask", prefix: 3, suffix: 3 }), "*****");
});

test("falls back to normal display for nulls and invalid formatter input", () => {
  assert.equal(applyColumnFormatter(null, { kind: "datetime", unit: "auto" }), "NULL");
  assert.equal(applyColumnFormatter("not json", { kind: "json-path", path: "$.a" }), "not json");
  assert.deepEqual(normalizeColumnFormatter({ kind: "datetime", unit: "invalid" }), undefined);
});

test("normalizes only supported formatter configs", () => {
  const config: ColumnFormatterConfig = { kind: "mask", prefix: 2, suffix: 4 };

  assert.deepEqual(normalizeColumnFormatter(config), config);
  assert.deepEqual(normalizeColumnFormatter({ kind: "json-path", path: "$.a[0]" }), {
    kind: "json-path",
    path: "$.a[0]",
  });
  assert.equal(normalizeColumnFormatter({ kind: "json-path", path: "a.b" }), undefined);
});

test("builds stable formatter keys for table columns", () => {
  assert.equal(
    buildColumnFormatterKey({
      connectionId: "conn",
      database: "db",
      schema: "public",
      tableName: "users",
      column: "created_at",
    }),
    "conn::db::public::users::created_at",
  );
});
