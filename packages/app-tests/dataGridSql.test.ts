import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildDataGridCopyInsertStatement,
  buildDataGridCopyUpdateStatements,
  normalizeDataGridSaveError,
  formatGridSqlLiteral,
} from "../../apps/desktop/src/lib/dataGridSql.ts";

test("builds copy-as-update statements using primary keys and non-primary-key columns", () => {
  const statements = buildDataGridCopyUpdateStatements({
    databaseType: "postgres",
    tableMeta: {
      schema: "public",
      tableName: "users",
      primaryKeys: ["id"],
    },
    columns: ["id", "name", "status"],
    rows: [[1, "Ada", "active"]],
  });

  assert.deepEqual(statements, [`UPDATE "public"."users" SET "name" = 'Ada', "status" = 'active' WHERE "id" = 1;`]);
});

test("builds copy-as-insert statement excluding primary key columns", () => {
  const statement = buildDataGridCopyInsertStatement({
    databaseType: "mysql",
    tableMeta: {
      tableName: "users",
      primaryKeys: ["id"],
    },
    columns: ["id", "login_name", "display_name"],
    rows: [
      [1, "ada", "Ada"],
      [2, "linus", "Linus"],
    ],
    excludePrimaryKeys: true,
  });

  assert.equal(
    statement,
    "INSERT INTO `users` (`login_name`, `display_name`) VALUES\n('ada', 'Ada'),\n('linus', 'Linus');",
  );
});

test("copy-as-insert excludes primary keys using source column names", () => {
  const statement = buildDataGridCopyInsertStatement({
    databaseType: "mysql",
    tableMeta: {
      tableName: "users",
      primaryKeys: ["user_id"],
    },
    columns: ["id", "name"],
    sourceColumns: ["user_id", "name"],
    rows: [[7, "Ada"]],
    excludePrimaryKeys: true,
  });

  assert.equal(statement, "INSERT INTO `users` (`name`) VALUES ('Ada');");
});

test("copy-as-insert without primary keys is unavailable when no primary key columns are visible", () => {
  const statement = buildDataGridCopyInsertStatement({
    databaseType: "postgres",
    tableMeta: {
      tableName: "users",
      primaryKeys: ["id"],
    },
    columns: ["name"],
    rows: [["Ada"]],
    excludePrimaryKeys: true,
  });

  assert.equal(statement, undefined);
});

test("skips copy-as-update statements when primary keys are unavailable", () => {
  const statements = buildDataGridCopyUpdateStatements({
    databaseType: "postgres",
    tableMeta: {
      tableName: "users",
      primaryKeys: [],
    },
    columns: ["id", "name"],
    rows: [[1, "Ada"]],
  });

  assert.deepEqual(statements, []);
});

test("formats TDengine timestamp literals with the local timezone offset", () => {
  assert.equal(
    formatGridSqlLiteral("2026-05-16 09:35:57.975", "tdengine"),
    tdengineTimestampLiteral("2026-05-16 09:35:57.975"),
  );
});

test("formats MySQL RFC3339 datetime strings as DATETIME-compatible literals", () => {
  assert.equal(formatGridSqlLiteral("2026-05-12T00:00:00+00:00", "mysql"), "'2026-05-12 00:00:00'");
  assert.equal(formatGridSqlLiteral("2026-05-12T00:00:00.123456Z", "mysql"), "'2026-05-12 00:00:00.123456'");
});

test("formats MySQL copy-as-update statements using target column temporal types", () => {
  const statements = buildDataGridCopyUpdateStatements({
    databaseType: "mysql",
    tableMeta: {
      tableName: "policies",
      primaryKeys: ["id"],
      columns: [
        { name: "id", data_type: "int", is_nullable: false, is_primary_key: true },
        { name: "insurance_start_time", data_type: "timestamp", is_nullable: true, is_primary_key: false },
        { name: "raw_text", data_type: "varchar(64)", is_nullable: true, is_primary_key: false },
      ],
    },
    columns: ["id", "insurance_start_time", "raw_text"],
    rows: [[1, "2026-05-12T00:00:00+00:00", "2026-05-12T00:00:00+00:00"]],
  });

  assert.deepEqual(statements, [
    "UPDATE `policies` SET `insurance_start_time` = '2026-05-12 00:00:00', `raw_text` = '2026-05-12T00:00:00+00:00' WHERE `id` = 1;",
  ]);
});

function tdengineTimestampLiteral(text: string): string {
  const [datePart, timePart] = text.split(" ");
  const [time, rawFraction = ""] = timePart.split(".");
  const fraction = `.${rawFraction.padEnd(3, "0").slice(0, 3)}`;
  const date = new Date(`${datePart}T${time}${fraction}`);
  const offsetMinutes = date.getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `'${datePart}T${time}${fraction}${sign}${hours}:${minutes}'`;
}

test("normalizes Hive ACID update and delete errors", () => {
  const error = normalizeDataGridSaveError(
    "hive",
    "Statement 1 failed: Agent RPC error (-1): Error while compiling statement: FAILED: SemanticException [Error 10294]: Attempt to do update or delete using transaction manager that does not support these operations.. Previous 0 statement(s) may have been committed.",
  );

  assert.equal(
    error,
    "Hive UPDATE/DELETE are not enabled for this table or server. Add rows with INSERT, or enable ACID transactional tables in Hive before editing/deleting existing rows.",
  );
});
