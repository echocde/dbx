import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Redis browser exposes key/value search modes", () => {
  const source = readFileSync("apps/desktop/src/components/redis/RedisKeyBrowser.vue", "utf8");

  assert.match(source, /type RedisSearchMode = "key" \| "value"/);
  assert.match(source, /searchMode\s*=\s*ref<RedisSearchMode>\("key"\)/);
  assert.match(source, /redisScanValues/);
  assert.match(source, /redis\.searchByKey/);
  assert.match(source, /redis\.searchByValue/);
});
