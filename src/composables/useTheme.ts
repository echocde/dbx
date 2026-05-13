import { computed, ref } from "vue";
import {
  APP_THEME_STORAGE_KEY,
  getTauriThemeForMode,
  normalizeAppThemeMode,
  resolveAppThemeAppearance,
  type AppThemeMode,
} from "@/lib/appTheme";
import { isTauriRuntime } from "@/lib/tauriRuntime";

const themeMode = ref<AppThemeMode>(
  normalizeAppThemeMode(typeof localStorage === "undefined" ? null : localStorage.getItem(APP_THEME_STORAGE_KEY)),
);
const systemPrefersDark = ref(readSystemPrefersDark());
const isDark = computed(() => resolveAppThemeAppearance(themeMode.value, systemPrefersDark.value) === "dark");

let mediaQuery: MediaQueryList | null = null;
let isListeningForSystemTheme = false;

function readSystemPrefersDark() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function setupSystemThemeListener() {
  if (isListeningForSystemTheme || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemPrefersDark.value = mediaQuery.matches;
  const onChange = (event: MediaQueryListEvent) => {
    systemPrefersDark.value = event.matches;
    if (themeMode.value === "system") applyTheme();
  };
  mediaQuery.addEventListener("change", onChange);
  isListeningForSystemTheme = true;
}

function applyTheme() {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", isDark.value);
  }
  if (!isTauriRuntime()) return;
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    getCurrentWindow()
      .setTheme(getTauriThemeForMode(themeMode.value))
      .catch(() => {});
  });
}

function setThemeMode(mode: AppThemeMode) {
  themeMode.value = mode;
  localStorage.setItem(APP_THEME_STORAGE_KEY, mode);
  applyTheme();
}

export function useTheme() {
  setupSystemThemeListener();

  function toggleTheme() {
    setThemeMode(isDark.value ? "light" : "dark");
  }

  return { isDark, themeMode, applyTheme, setThemeMode, toggleTheme };
}
