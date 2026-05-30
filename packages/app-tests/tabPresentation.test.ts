import { strict as assert } from "node:assert";
import test from "node:test";
import {
  colorForTabGroupKey,
  shouldShowTabOverflowControls,
  tabGroupColor,
  tabGroupKey,
} from "../../apps/desktop/src/lib/tabPresentation.ts";

test("tab overflow controls only show when there are hidden tabs to reach", () => {
  assert.equal(shouldShowTabOverflowControls(0, true, true, true), false);
  assert.equal(shouldShowTabOverflowControls(3, false, false, false), false);
  assert.equal(shouldShowTabOverflowControls(3, true, false, false), true);
  assert.equal(shouldShowTabOverflowControls(3, false, true, false), true);
  assert.equal(shouldShowTabOverflowControls(3, false, false, true), true);
});

test("tab group key and color are stable per connection database pair", () => {
  const first = { connectionId: "local", database: "orders" };
  const same = { connectionId: "local", database: "orders" };
  const other = { connectionId: "local", database: "billing" };

  assert.equal(tabGroupKey(first), "local::orders");
  assert.equal(tabGroupKey(first), tabGroupKey(same));
  assert.notEqual(tabGroupKey(first), tabGroupKey(other));
  assert.equal(tabGroupColor(first), tabGroupColor(same));
  assert.equal(colorForTabGroupKey(tabGroupKey(first)), tabGroupColor(first));
});
