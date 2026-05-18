import { strict as assert } from "node:assert";
import test from "node:test";
import {
  clampImagePreviewScale,
  imagePreviewTransform,
  nextImagePreviewScale,
} from "../../apps/desktop/src/lib/imagePreviewViewer.ts";

test("clamps image preview zoom to usable bounds", () => {
  assert.equal(clampImagePreviewScale(0.1), 0.2);
  assert.equal(clampImagePreviewScale(1.25), 1.25);
  assert.equal(clampImagePreviewScale(12), 8);
});

test("zooms in fixed steps from wheel direction", () => {
  assert.equal(nextImagePreviewScale(1, "in"), 1.2);
  assert.equal(nextImagePreviewScale(1, "out"), 0.8);
  assert.equal(nextImagePreviewScale(7.95, "in"), 8);
});

test("builds a stable CSS transform for image previews", () => {
  assert.equal(
    imagePreviewTransform({ scale: 1.5, rotation: 90, offsetX: 12, offsetY: -8 }),
    "translate(12px, -8px) rotate(90deg) scale(1.5)",
  );
});
