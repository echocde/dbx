<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ExternalLink, Maximize2, Minimize2, RotateCw, X, ZoomIn, ZoomOut } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { imagePreviewTransform, nextImagePreviewScale } from "@/lib/imagePreviewViewer";

const props = defineProps<{
  open: boolean;
  src: string;
  title?: string;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
}>();

const { t } = useI18n();
const scale = ref(1);
const rotation = ref(0);
const offsetX = ref(0);
const offsetY = ref(0);
const imageLoaded = ref(false);
const imageError = ref(false);
const dragStart = ref<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

const hostLabel = computed(() => {
  try {
    const url = new URL(props.src);
    return url.protocol === "data:" ? "data:image" : url.host;
  } catch {
    return "";
  }
});

const imageTitle = computed(() => props.title || t("grid.imagePreview"));
const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`);
const imageStyle = computed(() => ({
  transform: `translate(-50%, -50%) ${imagePreviewTransform({
    scale: scale.value,
    rotation: rotation.value,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  })}`,
}));

function resetViewer() {
  scale.value = 1;
  rotation.value = 0;
  offsetX.value = 0;
  offsetY.value = 0;
  imageLoaded.value = false;
  imageError.value = false;
  dragStart.value = null;
}

function close() {
  emit("update:open", false);
}

function zoomIn() {
  scale.value = nextImagePreviewScale(scale.value, "in");
}

function zoomOut() {
  scale.value = nextImagePreviewScale(scale.value, "out");
}

function fitImage() {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
}

function actualSize() {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
}

function rotateImage() {
  rotation.value = (rotation.value + 90) % 360;
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  scale.value = nextImagePreviewScale(scale.value, event.deltaY < 0 ? "in" : "out");
}

function onImagePointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  dragStart.value = { x: event.clientX, y: event.clientY, offsetX: offsetX.value, offsetY: offsetY.value };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onImagePointerMove(event: PointerEvent) {
  if (!dragStart.value) return;
  offsetX.value = dragStart.value.offsetX + event.clientX - dragStart.value.x;
  offsetY.value = dragStart.value.offsetY + event.clientY - dragStart.value.y;
}

function onImagePointerUp(event: PointerEvent) {
  dragStart.value = null;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
}

function onDoubleClick() {
  scale.value = scale.value === 1 ? 2 : 1;
  offsetX.value = 0;
  offsetY.value = 0;
}

function openExternal() {
  window.open(props.src, "_blank", "noopener,noreferrer");
}

watch(
  () => [props.open, props.src] as const,
  ([open]) => {
    if (open) resetViewer();
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="(value) => emit('update:open', value)">
    <DialogContent
      :show-close-button="false"
      class="image-preview-dialog h-[min(86vh,920px)] w-[min(92vw,1280px)] max-w-none gap-0 overflow-hidden rounded-xl border-white/10 bg-[#090b0f] p-0 text-white shadow-2xl"
      @escape-key-down="close"
    >
      <div class="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-white/[0.035] px-4">
        <div class="min-w-0 flex-1">
          <DialogTitle class="truncate text-sm font-semibold text-white">{{ imageTitle }}</DialogTitle>
          <div class="truncate text-[11px] text-white/45">{{ hostLabel || src }}</div>
        </div>
        <div class="flex items-center gap-1 rounded-md border border-white/10 bg-black/20 p-1">
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/75 hover:bg-white/10 hover:text-white"
            :title="t('grid.zoomOut')"
            @click="zoomOut"
          >
            <ZoomOut class="h-3.5 w-3.5" />
          </Button>
          <div class="w-12 text-center text-[11px] tabular-nums text-white/65">{{ zoomLabel }}</div>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/75 hover:bg-white/10 hover:text-white"
            :title="t('grid.zoomIn')"
            @click="zoomIn"
          >
            <ZoomIn class="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/75 hover:bg-white/10 hover:text-white"
            :title="t('grid.fitImage')"
            @click="fitImage"
          >
            <Maximize2 class="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/75 hover:bg-white/10 hover:text-white"
            :title="t('grid.actualSize')"
            @click="actualSize"
          >
            <Minimize2 class="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/75 hover:bg-white/10 hover:text-white"
            :title="t('grid.rotateImage')"
            @click="rotateImage"
          >
            <RotateCw class="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-white/75 hover:bg-white/10 hover:text-white"
            :title="t('grid.openImage')"
            @click="openExternal"
          >
            <ExternalLink class="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
          :title="t('dangerDialog.cancel')"
          @click="close"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div
        class="image-preview-stage relative min-h-0 flex-1 overflow-hidden"
        :class="{ 'cursor-grabbing': dragStart, 'cursor-grab': !dragStart && imageLoaded && !imageError }"
        @wheel="onWheel"
      >
        <div v-if="!imageLoaded && !imageError" class="absolute inset-0 flex items-center justify-center">
          <div
            class="h-16 w-16 animate-pulse rounded-full border border-white/10 bg-white/10 shadow-[0_0_80px_rgba(255,255,255,0.12)]"
          />
        </div>
        <div
          v-if="imageError"
          class="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-white/55"
        >
          {{ t("grid.imageLoadFailed") }}
        </div>
        <img
          v-show="!imageError"
          :src="src"
          :alt="imageTitle"
          draggable="false"
          decoding="async"
          referrerpolicy="no-referrer"
          class="absolute left-1/2 top-1/2 max-h-[78vh] max-w-[88vw] select-none object-contain transition-opacity duration-150"
          :class="{ 'opacity-100': imageLoaded, 'opacity-0': !imageLoaded }"
          :style="imageStyle"
          @load="imageLoaded = true"
          @error="imageError = true"
          @pointerdown="onImagePointerDown"
          @pointermove="onImagePointerMove"
          @pointerup="onImagePointerUp"
          @pointercancel="onImagePointerUp"
          @dblclick="onDoubleClick"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.image-preview-stage {
  background-color: #07090d;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.055) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.055) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.055) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.055) 75%),
    radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.08), transparent 42%);
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0,
    center;
  background-size:
    24px 24px,
    24px 24px,
    24px 24px,
    24px 24px,
    100% 100%;
}
</style>
