import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Redis DB flush is exposed from the sidebar DB context menu", () => {
  const source = readFileSync("apps/desktop/src/components/sidebar/TreeItem.vue", "utf8");

  assert.match(source, /const showFlushRedisDbConfirm = ref\(false\)/);
  assert.match(source, /function flushRedisDb\(\)/);
  assert.match(source, /async function confirmFlushRedisDb\(\)/);
  assert.match(source, /await api\.redisFlushDb\(node\.connectionId, Number\(node\.database\)\)/);
  assert.match(source, /connectionStore\.updateRedisDbKeyStats\(node\.connectionId, Number\(node\.database\), \{ loaded: 0, total: 0 \}\)/);
  assert.match(source, /if \(node\.type === "redis-db" \|\| node\.type === "mongo-db"\) \{/);
  assert.match(source, /if \(node\.type === "redis-db"\) \{/);
  assert.match(source, /items\.push\(\{ label: t\("redis\.flushDb"\), action: flushRedisDb, icon: Eraser, variant: "destructive" as const \}\)/);
  assert.match(source, /t\("redis\.flushDb"\)/);
  assert.match(source, /v-model:open="showFlushRedisDbConfirm"/);
  assert.match(source, /:message="t\('redis\.flushDbMessage'\)"/);
  assert.match(source, /:details="t\('redis\.flushDbDetails', \{ db: node\.database \}\)"/);
  assert.match(source, /:confirm-label="t\('redis\.flushDbConfirm'\)"/);
  assert.match(source, /@confirm="confirmFlushRedisDb"/);
});

test("Redis command panel no longer shows a flush DB button", () => {
  const source = readFileSync("apps/desktop/src/components/redis/RedisKeyBrowser.vue", "utf8");

  assert.doesNotMatch(source, /requestFlushDb/);
  assert.doesNotMatch(source, /redisFlushDb/);
  assert.doesNotMatch(source, /DatabaseZap/);
  assert.doesNotMatch(source, /redis\.flushDb/);
});
