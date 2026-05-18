import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const appSource = readFileSync("apps/desktop/src/App.vue", "utf8");
const appDialogsSource = readFileSync("apps/desktop/src/components/layout/AppDialogs.vue", "utf8");

test("app defers cold-start side panels and modal pages behind async components", () => {
  assert.match(appSource, /defineAsyncComponent/);
  for (const component of ["AiAssistant", "QueryHistory", "DriverStorePage", "UpdateDialog", "LoginPage"]) {
    assert.doesNotMatch(appSource, new RegExp(`import ${component} from`));
    assert.match(appSource, new RegExp(`const ${component} = defineAsyncComponent`));
  }
});

test("app dialogs keep non-primary dialogs out of the startup chunk", () => {
  for (const component of ["ConnectionDialog", "EditorSettingsDialog", "DangerConfirmDialog"]) {
    assert.doesNotMatch(appDialogsSource, new RegExp(`import ${component} from`));
    assert.match(appDialogsSource, new RegExp(`const ${component} = defineAsyncComponent`));
  }
});

test("app dialogs only render async dialogs when their open state needs them", () => {
  assert.match(appDialogsSource, /<ConnectionDialog\s+v-if="showConnectionDialog \|\| editConfig"/);
  assert.match(appDialogsSource, /<EditorSettingsDialog\s+v-if="showSettingsDialog"/);
  assert.match(appDialogsSource, /<DangerConfirmDialog\s+v-if="showDangerDialog"/);
  assert.match(appDialogsSource, /<DataTransferDialog\s+v-if="dialogs\.showTransferDialog\.value"/);
  assert.match(appDialogsSource, /<SchemaDiagramDialog\s+v-if="dialogs\.showDiagramDialog\.value"/);
  assert.match(appDialogsSource, /<DatabaseExportDialog\s+v-if="dialogs\.showDatabaseExportDialog\.value"/);
});
