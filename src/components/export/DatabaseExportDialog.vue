<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConnectionStore } from "@/stores/connectionStore";
import DatabaseIcon from "@/components/icons/DatabaseIcon.vue";
import * as api from "@/lib/api";
import type { ExportProgress } from "@/lib/api";
import { isSchemaAware } from "@/lib/databaseCapabilities";
import { isTauriRuntime } from "@/lib/tauriRuntime";
import { useToast } from "@/composables/useToast";
import { Download, Square, CheckSquare, X } from "lucide-vue-next";

const { t } = useI18n();
const { toast } = useToast();
const open = defineModel<boolean>("open", { default: false });
const store = useConnectionStore();

const props = defineProps<{
  prefillConnectionId?: string;
  prefillDatabase?: string;
  prefillSchema?: string;
}>();

// Connection / Database / Schema selectors
const connectionId = ref("");
const database = ref("");
const databases = ref<string[]>([]);
const schema = ref("");
const schemas = ref<string[]>([]);
const loadingMeta = ref(false);

// Options
const includeStructure = ref(true);
const includeData = ref(true);
const includeObjects = ref(true);

// Export state
const isExporting = ref(false);
const exportProgress = ref<ExportProgress | null>(null);
const exportId = ref("");
const exportDone = ref(false);
const exportError = ref<string | null>(null);
const exportCancelled = ref(false);

const sqlConnections = computed(() =>
  store.connections.filter((c) => !["redis", "mongodb", "elasticsearch"].includes(c.db_type)),
);

const canExport = computed(
  () =>
    connectionId.value &&
    database.value &&
    schema.value &&
    (includeStructure.value || includeData.value || includeObjects.value) &&
    !isExporting.value,
);

function connectionIconType(connId: string) {
  const config = store.getConfig(connId);
  return config?.driver_profile || config?.db_type || "mysql";
}

async function loadDatabases(connId: string) {
  if (!connId) return;
  loadingMeta.value = true;
  try {
    await store.ensureConnected(connId);
    const dbs = await api.listDatabases(connId);
    const names = dbs.map((d) => d.name);
    databases.value = names;
    database.value = names.length === 1 ? names[0] : "";
    schemas.value = [];
    schema.value = "";
  } catch {
    databases.value = [];
  } finally {
    loadingMeta.value = false;
  }
}

async function loadSchemas(preferredSchema = "") {
  if (!connectionId.value || !database.value) return;
  const config = store.getConfig(connectionId.value);
  if (!isSchemaAware(config?.db_type)) {
    schemas.value = [];
    schema.value = database.value;
    return;
  }

  const schemaList = await api.listSchemas(connectionId.value, database.value);
  const selected =
    preferredSchema && schemaList.includes(preferredSchema)
      ? preferredSchema
      : schemaList.includes("public")
        ? "public"
        : (schemaList[0] ?? "");
  schemas.value = schemaList;
  schema.value = selected;
}

async function startExport() {
  if (!canExport.value) return;
  isExporting.value = true;
  exportDone.value = false;
  exportError.value = null;
  exportCancelled.value = false;
  exportProgress.value = null;

  exportId.value = crypto.randomUUID();

  let filePath = "";

  if (isTauriRuntime()) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const safeName = (database.value || "database").replace(/[\\/:*?"<>|]+/g, "_").trim();
      const path = await save({
        defaultPath: `${safeName}.sql`,
        filters: [{ name: "SQL", extensions: ["sql"] }],
      });
      if (!path) {
        isExporting.value = false;
        return;
      }
      filePath = path;
    } catch (e: any) {
      isExporting.value = false;
      toast(e?.message || String(e), 5000);
      return;
    }
  } else {
    // Web mode: use a temp path; the server will handle the file
    filePath = `__web_export_${exportId.value}.sql`;
  }

  const request: api.DatabaseExportRequest = {
    exportId: exportId.value,
    connectionId: connectionId.value,
    database: database.value,
    schema: schema.value,
    filePath,
    includeStructure: includeStructure.value,
    includeData: includeData.value,
    includeObjects: includeObjects.value,
    batchSize: 1000,
  };

  try {
    await api.exportDatabaseSql(request, (progress) => {
      exportProgress.value = { ...progress };
      if (progress.status === "Done") {
        exportDone.value = true;
        isExporting.value = false;
        toast(t("databaseExport.exportSuccess"), 3000);
      } else if (progress.status === "Error") {
        exportError.value = progress.error;
        isExporting.value = false;
      } else if (progress.status === "Cancelled") {
        exportCancelled.value = true;
        isExporting.value = false;
      }
    });
  } catch (e: any) {
    exportError.value = e?.message || String(e);
    isExporting.value = false;
  }
}

async function cancelExport() {
  if (exportId.value) {
    await api.cancelDatabaseExport(exportId.value);
  }
}

function resetState() {
  connectionId.value = "";
  database.value = "";
  databases.value = [];
  schema.value = "";
  schemas.value = [];
  includeStructure.value = true;
  includeData.value = true;
  includeObjects.value = true;
  isExporting.value = false;
  exportProgress.value = null;
  exportDone.value = false;
  exportError.value = null;
  exportCancelled.value = false;
  exportId.value = "";
}

const progressPercent = computed(() => {
  const p = exportProgress.value;
  if (!p || p.totalObjects === 0) return 0;
  return Math.round((p.objectIndex / p.totalObjects) * 100);
});

const skipConnectionWatch = ref(false);

watch(connectionId, (id) => {
  if (skipConnectionWatch.value) {
    skipConnectionWatch.value = false;
    return;
  }
  database.value = "";
  databases.value = [];
  schemas.value = [];
  schema.value = "";
  loadDatabases(id);
});

watch(database, (db) => {
  schema.value = "";
  schemas.value = [];
  if (db) loadSchemas(props.prefillSchema).catch((e) => toast(String(e), 5000));
});

watch(open, async (val) => {
  if (val) {
    resetState();
    if (props.prefillConnectionId) {
      skipConnectionWatch.value = true;
      connectionId.value = props.prefillConnectionId;
      await loadDatabases(props.prefillConnectionId);
      if (props.prefillDatabase) {
        database.value = props.prefillDatabase;
        await loadSchemas(props.prefillSchema);
      }
    }
  }
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden" @interact-outside.prevent>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Download class="w-4 h-4" />
          {{ t("databaseExport.title") }}
        </DialogTitle>
      </DialogHeader>

      <div class="flex-1 min-h-0 overflow-auto space-y-4 py-2">
        <!-- Connection / Database / Schema Selection -->
        <div v-if="!isExporting && !exportDone && !exportError && !exportCancelled" class="space-y-3">
          <div class="space-y-1.5">
            <Label class="text-xs">{{ t("transfer.sourceConnection") }}</Label>
            <Select :model-value="connectionId" @update:model-value="(v: any) => (connectionId = String(v))">
              <SelectTrigger class="h-8 text-xs">
                <div class="flex items-center gap-2">
                  <DatabaseIcon v-if="connectionId" :db-type="connectionIconType(connectionId)" class="w-3.5 h-3.5" />
                  <SelectValue :placeholder="t('diff.selectConnection')" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="c in sqlConnections" :key="c.id" :value="c.id">
                  <div class="flex items-center gap-2">
                    <DatabaseIcon :db-type="c.driver_profile || c.db_type" class="w-3.5 h-3.5" />
                    {{ c.name }}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="databases.length" class="space-y-1.5">
            <Label class="text-xs">{{ t("transfer.sourceDatabase") }}</Label>
            <Select :model-value="database" @update:model-value="(v: any) => (database = String(v))">
              <SelectTrigger class="h-8 text-xs">
                <SelectValue :placeholder="t('diff.selectDatabase')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="db in databases" :key="db" :value="db">{{ db }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="schemas.length" class="space-y-1.5">
            <Label class="text-xs">{{ t("diff.selectSchema") }}</Label>
            <Select :model-value="schema" @update:model-value="(v: any) => (schema = String(v))">
              <SelectTrigger class="h-8 text-xs">
                <SelectValue :placeholder="t('diff.selectSchema')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in schemas" :key="s" :value="s">{{ s }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Options -->
          <div class="space-y-2.5 pt-1">
            <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {{ t("settings.options") }}
            </div>
            <div class="flex items-center gap-2 cursor-pointer text-xs" @click="includeStructure = !includeStructure">
              <CheckSquare v-if="includeStructure" class="w-3.5 h-3.5 text-primary shrink-0" />
              <Square v-else class="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              {{ t("databaseExport.includeStructure") }}
            </div>
            <div class="flex items-center gap-2 cursor-pointer text-xs" @click="includeData = !includeData">
              <CheckSquare v-if="includeData" class="w-3.5 h-3.5 text-primary shrink-0" />
              <Square v-else class="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              {{ t("databaseExport.includeData") }}
            </div>
            <div class="flex items-center gap-2 cursor-pointer text-xs" @click="includeObjects = !includeObjects">
              <CheckSquare v-if="includeObjects" class="w-3.5 h-3.5 text-primary shrink-0" />
              <Square v-else class="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              {{ t("databaseExport.includeObjects") }}
            </div>
          </div>
        </div>

        <!-- Progress View -->
        <div v-if="isExporting || exportDone || exportError || exportCancelled" class="py-3 space-y-3">
          <div v-if="exportProgress" class="space-y-2">
            <div class="text-xs text-muted-foreground">
              {{
                t("databaseExport.currentTable", {
                  table: exportProgress.currentObject,
                  current: exportProgress.objectIndex,
                  total: exportProgress.totalObjects,
                })
              }}
            </div>

            <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="exportError ? 'bg-destructive' : exportCancelled ? 'bg-yellow-500' : 'bg-primary'"
                :style="{ width: `${progressPercent}%` }"
              />
            </div>

            <div class="text-xs text-muted-foreground">
              {{ t("databaseExport.rowsExported", { count: exportProgress.rowsExported.toLocaleString() }) }}
            </div>
          </div>

          <!-- Status messages -->
          <div v-if="exportDone" class="text-xs text-green-600 font-medium">
            {{ t("databaseExport.exportSuccess") }}
          </div>
          <div v-else-if="exportError" class="text-xs text-destructive font-medium">
            {{ t("databaseExport.exportError", { error: exportError }) }}
          </div>
          <div v-else-if="exportCancelled" class="text-xs text-yellow-600 font-medium">
            {{ t("databaseExport.exportCancelled") }}
          </div>
        </div>
      </div>

      <DialogFooter>
        <template v-if="!isExporting && !exportDone && !exportError && !exportCancelled">
          <Button variant="outline" size="sm" @click="open = false">
            {{ t("transfer.cancel") }}
          </Button>
          <Button size="sm" :disabled="!canExport" @click="startExport">
            <Download class="w-3.5 h-3.5 mr-1.5" />
            {{ t("databaseExport.export") }}
          </Button>
        </template>
        <template v-else-if="isExporting">
          <Button variant="destructive" size="sm" @click="cancelExport">
            <X class="w-3.5 h-3.5 mr-1.5" />
            {{ t("transfer.cancel") }}
          </Button>
        </template>
        <template v-else>
          <Button size="sm" @click="open = false">
            {{ t("common.close") }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
