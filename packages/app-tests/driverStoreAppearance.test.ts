import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import test from "node:test";

const source = readFileSync("apps/desktop/src/components/config/DriverStoreDialog.vue", "utf8");

test("driver store uses a macOS-style grouped list presentation", () => {
  for (const className of [
    "driver-store-page",
    "driver-store-panel",
    "driver-store-list",
    "driver-store-row",
    "driver-store-action-primary",
  ]) {
    assert.match(source, new RegExp(className));
  }
});

test("driver store keeps native tab styling", () => {
  assert.doesNotMatch(source, /driver-store-segmented/);
  assert.doesNotMatch(source, /:deep\(\.driver-store-segmented/);
});
