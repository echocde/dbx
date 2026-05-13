<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface AgentDriverInfo {
  db_type: string;
  label: string;
  version: string;
  size: number;
  installed: boolean;
  installed_version: string | null;
  update_available: boolean;
}

const drivers = ref<AgentDriverInfo[]>([]);
const jreInstalled = ref(false);
const installing = ref<string | null>(null);
const reinstallingJre = ref(false);

onMounted(async () => {
  await refresh();
});

async function refresh() {
  jreInstalled.value = await invoke<boolean>("check_jre_installed");
  drivers.value = await invoke<AgentDriverInfo[]>("list_installed_agents");
}

async function installDriver(dbType: string) {
  installing.value = dbType;
  try {
    await invoke("install_agent", { dbType });
    await refresh();
  } catch (e: any) {
    alert(e);
  } finally {
    installing.value = null;
  }
}

async function uninstallDriver(dbType: string) {
  try {
    await invoke("uninstall_agent", { dbType });
    await refresh();
  } catch (e: any) {
    alert(e);
  }
}

async function reinstallJre() {
  reinstallingJre.value = true;
  try {
    await invoke("reinstall_jre");
    await refresh();
  } catch (e: any) {
    alert(e);
  } finally {
    reinstallingJre.value = false;
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <div class="space-y-3">
    <div class="space-y-1">
      <Label>Agent 驱动</Label>
    </div>

    <div class="rounded-md border bg-muted/20 p-4">
      <div class="flex min-h-8 items-center justify-between gap-3">
        <div class="min-w-0 space-y-1">
          <Label class="text-sm">JRE 运行时</Label>
          <p v-if="!jreInstalled" class="text-xs text-muted-foreground">首次安装驱动时自动下载</p>
        </div>
        <div class="flex shrink-0 items-center gap-3">
          <span v-if="jreInstalled" class="text-xs text-green-600">已安装</span>
          <span v-else class="text-xs text-muted-foreground">未安装</span>
          <Button
            v-if="jreInstalled"
            type="button"
            variant="outline"
            size="sm"
            :disabled="reinstallingJre || installing !== null"
            @click="reinstallJre"
          >
            {{ reinstallingJre ? "重装中..." : "重新安装" }}
          </Button>
        </div>
      </div>
    </div>

    <div class="rounded-md border">
      <div v-if="drivers.length === 0" class="p-4 text-sm text-muted-foreground">加载中...</div>
      <div v-else class="divide-y">
        <div v-for="driver in drivers" :key="driver.db_type" class="flex items-center gap-3 p-3">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">{{ driver.label }}</div>
            <div class="text-xs text-muted-foreground">
              <span v-if="driver.installed">v{{ driver.installed_version }}</span>
              <span v-if="driver.installed && formatSize(driver.size)"> · </span>
              <span v-if="formatSize(driver.size)">{{ formatSize(driver.size) }}</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span v-if="driver.installed" class="text-xs text-green-600">已安装</span>
            <Button v-if="driver.installed" variant="ghost" size="sm" @click="uninstallDriver(driver.db_type)">
              卸载
            </Button>
            <Button v-else size="sm" :disabled="installing !== null" @click="installDriver(driver.db_type)">
              {{ installing === driver.db_type ? "安装中..." : "安装" }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
