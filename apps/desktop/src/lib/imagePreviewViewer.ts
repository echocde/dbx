export const IMAGE_PREVIEW_MIN_SCALE = 0.2;
export const IMAGE_PREVIEW_MAX_SCALE = 8;
export const IMAGE_PREVIEW_ZOOM_STEP = 0.2;

export type ImagePreviewZoomDirection = "in" | "out";

export function clampImagePreviewScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(Number(scale.toFixed(2)), IMAGE_PREVIEW_MIN_SCALE), IMAGE_PREVIEW_MAX_SCALE);
}

export function nextImagePreviewScale(scale: number, direction: ImagePreviewZoomDirection): number {
  const delta = direction === "in" ? IMAGE_PREVIEW_ZOOM_STEP : -IMAGE_PREVIEW_ZOOM_STEP;
  return clampImagePreviewScale(scale + delta);
}

export function imagePreviewTransform(options: {
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}): string {
  return `translate(${options.offsetX}px, ${options.offsetY}px) rotate(${options.rotation}deg) scale(${options.scale})`;
}
