import { defineStore } from "pinia";
import { ref } from "vue";
import * as api from "@/lib/api";
import { buildAgentRuntimeSnapshot, DEFAULT_RESULT_SAMPLE_LIMIT } from "@/lib/agentRuntimeSnapshot";
import { useConnectionStore } from "@/stores/connectionStore";
import { useQueryStore } from "@/stores/queryStore";

export const useAgentRuntimeStore = defineStore("agentRuntime", () => {
  const selection = ref<unknown>({ type: "none" });
  const selectedSql = ref("");
  let timer: ReturnType<typeof setTimeout> | null = null;

  function setSelection(value: unknown) {
    selection.value = value;
    scheduleSync();
  }

  function setSelectedSql(value: string) {
    selectedSql.value = value;
    scheduleSync();
  }

  function scheduleSync() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void syncNow();
    }, 100);
  }

  async function syncNow() {
    const connectionStore = useConnectionStore();
    const queryStore = useQueryStore();
    const snapshot = buildAgentRuntimeSnapshot({
      tabs: queryStore.tabs,
      activeTabId: queryStore.activeTabId,
      getConnection: (connectionId) => connectionStore.getConfig(connectionId),
      selectedSql: selectedSql.value,
      selection: selection.value,
      resultSampleLimit: DEFAULT_RESULT_SAMPLE_LIMIT,
    });

    try {
      await api.agentRuntimeUpdateSnapshot(snapshot);
    } catch (err) {
      console.debug("[DBX] Agent runtime snapshot sync skipped:", err);
    }
  }

  return { selection, selectedSql, setSelection, setSelectedSql, scheduleSync, syncNow };
});
