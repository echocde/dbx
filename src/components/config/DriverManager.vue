<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/composables/useToast";

const { toast } = useToast();

interface AgentDriverInfo {
  db_type: string;
  label: string;
  version: string;
  size: number;
  installed: boolean;
  installed_version: string | null;
  update_available: boolean;
}

interface InstallProgress {
  step: string;
  downloaded?: number;
  total?: number;
}

const drivers = ref<AgentDriverInfo[]>([]);
const jreInstalled = ref(false);
const installing = ref<string | null>(null);
const reinstallingJre = ref(false);
const progress = ref<InstallProgress | null>(null);

let unlisten: UnlistenFn | null = null;

onMounted(async () => {
  await refresh();
  unlisten = await listen<InstallProgress>("agent-install-progress", (event) => {
    if (event.payload.step === "done") {
      progress.value = null;
    } else {
      progress.value = event.payload;
    }
  });
});

onUnmounted(() => {
  unlisten?.();
});

const progressText = computed(() => {
  const p = progress.value;
  if (!p) return "";
  if (p.step === "jre-extract") return "解压 JRE...";
  const label = p.step === "jre" ? "下载 JRE" : "下载驱动";
  if (!p.total) return `${label}...`;
  const pct = Math.round(((p.downloaded ?? 0) / p.total) * 100);
  const dl = formatSize(p.downloaded ?? 0);
  const total = formatSize(p.total);
  return `${label}  ${dl} / ${total}  (${pct}%)`;
});

const progressPercent = computed(() => {
  const p = progress.value;
  if (!p || !p.total) return 0;
  return Math.round(((p.downloaded ?? 0) / p.total) * 100);
});

async function refresh() {
  jreInstalled.value = await invoke<boolean>("check_jre_installed");
  drivers.value = await invoke<AgentDriverInfo[]>("list_installed_agents");
}

async function installDriver(dbType: string) {
  const label = drivers.value.find((d) => d.db_type === dbType)?.label ?? dbType;
  installing.value = dbType;
  progress.value = null;
  try {
    await invoke("install_agent", { dbType });
    await refresh();
    toast(`${label} 驱动安装成功`);
  } catch (e: any) {
    toast(`${label} 驱动安装失败: ${e}`);
  } finally {
    installing.value = null;
    progress.value = null;
  }
}

async function uninstallDriver(dbType: string) {
  const label = drivers.value.find((d) => d.db_type === dbType)?.label ?? dbType;
  try {
    await invoke("uninstall_agent", { dbType });
    await refresh();
    toast(`${label} 驱动已卸载`);
  } catch (e: any) {
    toast(`${label} 驱动卸载失败: ${e}`);
  }
}

async function reinstallJre() {
  reinstallingJre.value = true;
  progress.value = null;
  try {
    await invoke("reinstall_jre");
    await refresh();
    toast("JRE 重新安装成功");
  } catch (e: any) {
    toast(`JRE 重新安装失败: ${e}`);
  } finally {
    reinstallingJre.value = false;
    progress.value = null;
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
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

    <!-- Progress bar -->
    <div v-if="progress" class="space-y-1.5">
      <div class="text-xs text-muted-foreground">{{ progressText }}</div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all duration-200"
          :style="{ width: `${progressPercent}%` }"
        />
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
              <span v-if="driver.update_available" class="ml-1.5 text-amber-500">有更新</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span v-if="driver.installed" class="text-xs text-green-600">已安装</span>
            <Button v-if="driver.installed" variant="ghost" size="sm" @click="uninstallDriver(driver.db_type)">
              卸载
            </Button>
            <Button
              v-if="driver.installed && driver.update_available"
              size="sm"
              variant="outline"
              :disabled="installing !== null"
              @click="installDriver(driver.db_type)"
            >
              {{ installing === driver.db_type ? "更新中..." : "更新" }}
            </Button>
            <Button
              v-if="!driver.installed"
              size="sm"
              :disabled="installing !== null"
              @click="installDriver(driver.db_type)"
            >
              {{ installing === driver.db_type ? "安装中..." : "安装" }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
