import { strict as assert } from "node:assert";
import test from "node:test";
import { buildObjectBrowserRows } from "../../apps/desktop/src/lib/objectBrowserRows.ts";

test("builds unique row ids for overloaded routines with the same visible name", () => {
  const rows = buildObjectBrowserRows({
    objects: [
      { name: "list_pipes", object_type: "FUNCTION", schema: "dbms_pipe" },
      { name: "list_pipes", object_type: "FUNCTION", schema: "dbms_pipe" },
      { name: "create_pipe", object_type: "FUNCTION", schema: "dbms_pipe" },
    ],
    database: "highgo",
    fallbackSchema: "dbms_pipe",
    needsSchema: true,
  });

  assert.deepEqual(
    rows.map((row) => row.id),
    ["dbms_pipe:list_pipes:FUNCTION:0", "dbms_pipe:list_pipes:FUNCTION:1", "dbms_pipe:create_pipe:FUNCTION:0"],
  );
});
