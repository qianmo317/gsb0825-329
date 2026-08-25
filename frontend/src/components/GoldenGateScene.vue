<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import { GoldenGateWorld } from '../three/GoldenGateWorld';
import ControlPanel from './ControlPanel.vue';
import type {
  CameraReadout,
  CameraViewId,
  DayNightPreset,
  EnvironmentSettings,
} from '../three/types';

const canvasContainer = ref<HTMLDivElement | null>(null);
const panelRef = ref<InstanceType<typeof ControlPanel> | null>(null);
const readout = ref<CameraReadout | null>(null);

// The world holds all Three.js state; keep it non-reactive via shallowRef.
const world = shallowRef<GoldenGateWorld | null>(null);

const onUpdateEnvironment = (patch: Partial<EnvironmentSettings>): void => {
  world.value?.updateEnvironment(patch);
};

const onApplyPreset = (preset: DayNightPreset): void => {
  const next = world.value?.applyPreset(preset);
  if (next) panelRef.value?.syncFromSettings(next);
};

const onFlyTo = (view: CameraViewId): void => {
  world.value?.flyTo(view);
};

const onExportImage = (): void => {
  const w = world.value;
  if (!w) return;
  const dataUrl = w.captureImage();
  const link = document.createElement('a');
  link.download = `golden-gate-${Date.now()}.png`;
  link.href = dataUrl;
  link.click();
};

onMounted(() => {
  if (!canvasContainer.value) return;
  const w = new GoldenGateWorld(canvasContainer.value);
  w.setReadoutHandler((r) => {
    readout.value = r;
  });
  world.value = w;
});

onBeforeUnmount(() => {
  world.value?.dispose();
  world.value = null;
});
</script>

<template>
  <div ref="canvasContainer" class="canvas-container"></div>

  <ControlPanel
    v-if="world"
    ref="panelRef"
    :bridge="world.getBridgeParams()"
    :readout="readout"
    @update-environment="onUpdateEnvironment"
    @apply-preset="onApplyPreset"
    @fly-to="onFlyTo"
    @export-image="onExportImage"
  />

  <div class="overlay">
    <h1>金门大桥</h1>
  </div>
</template>

<style scoped>
.canvas-container {
  width: 100vw;
  height: 100vh;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.overlay {
  position: absolute;
  bottom: 30px;
  left: 30px;
  z-index: 2;
  color: white;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.overlay h1 {
  margin: 0;
  font-size: 2.5rem;
  letter-spacing: 2px;
  font-weight: 300;
}
</style>
