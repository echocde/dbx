import assert from "node:assert/strict";
import test from "node:test";
import {
  agentDriverUpdateIgnoreKey,
  agentDriverUpdateKeyForConnection,
  findAgentDriverUpdatePrompt,
} from "../src/lib/agentDriverUpdatePrompt.ts";

const oracleConnection = {
  id: "conn",
  name: "Oracle",
  db_type: "oracle",
  driver_profile: undefined,
} as const;

test("uses the driver profile for versioned agent drivers", () => {
  assert.equal(agentDriverUpdateKeyForConnection({ db_type: "oracle", driver_profile: "oracle-10g" }), "oracle-10g");
  assert.equal(agentDriverUpdateKeyForConnection({ db_type: "oracle" }), "oracle");
  assert.equal(agentDriverUpdateKeyForConnection({ db_type: "postgres" }), null);
});

test("finds installed agent drivers with available updates", () => {
  assert.deepEqual(
    findAgentDriverUpdatePrompt(oracleConnection, [
      {
        db_type: "oracle",
        label: "Oracle",
        installed: true,
        installed_version: "1.0.0",
        version: "1.1.0",
        update_available: true,
      },
    ]),
    {
      dbType: "oracle",
      label: "Oracle",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
    },
  );
});

test("does not prompt for missing, current, or ignored driver updates", () => {
  assert.equal(
    findAgentDriverUpdatePrompt(oracleConnection, [
      {
        db_type: "oracle",
        label: "Oracle",
        installed: false,
        installed_version: null,
        version: "1.1.0",
        update_available: true,
      },
    ]),
    null,
  );

  assert.equal(
    findAgentDriverUpdatePrompt(
      oracleConnection,
      [
        {
          db_type: "oracle",
          label: "Oracle",
          installed: true,
          installed_version: "1.0.0",
          version: "1.1.0",
          update_available: true,
        },
      ],
      new Set([agentDriverUpdateIgnoreKey("oracle", "1.1.0")]),
    ),
    null,
  );
});
