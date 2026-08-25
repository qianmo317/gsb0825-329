<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, reactive } from 'vue';
import { BridgeSceneController, DEFAULT_ENVIRONMENT } from '../scene/bridgeSceneController';
import type {
  EnvironmentParams,
  TimeOfDayPreset,
  CameraViewId,
  CameraViewInfo,
  BridgeStats,
  LiveStats,
} from '../scene/bridgeSceneController';

interface SliderConfig {
  key: keyof EnvironmentParams;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

const TIME_PRESETS: { id: TimeOfDayPreset; label: string }[] = [
  { id: 'night', label: '夜晚' },
  { id: 'dusk', label: '黄昏' },
  { id: 'day', label: '白天' },
];

const SLIDERS: SliderConfig[] = [
  {
    key: 'sunElevation',
    label: '太阳高度',
    min: -20,
    max: 90,
    step: 1,
    format: (v) => `${v.toFixed(0)}°`,
  },
  {
    key: 'sunAzimuth',
    label: '太阳方位',
    min: 0,
    max: 360,
    step: 1,
    format: (v) => `${v.toFixed(0)}°`,
  },
  {
    key: 'fogDensity',
    label: '雾气浓度',
    min: 0,
    max: 0.006,
    step: 0.0001,
    format: (v) => (v * 1000).toFixed(2),
  },
  {
    key: 'waveStrength',
    label: '海洋波纹',
    min: 0,
    max: 8,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'exposure',
    label: '画面曝光',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
];

const canvasContainer = ref<HTMLDivElement | null>(null);
const panelOpen = ref(true);

const env = reactive<EnvironmentParams>({ ...DEFAULT_ENVIRONMENT });
const views = ref<CameraViewInfo[]>([]);
const stats = ref<BridgeStats | null>(null);
const live = ref<LiveStats>({
  fps: 0,
  cameraX: 0,
  cameraY: 0,
  cameraZ: 0,
  viewId: 'free',
});

let controller: BridgeSceneController | null = null;
let statsTimer: ReturnType<typeof setInterval> | null = null;

const syncEnvironment = (): void => {
  controller?.updateEnvironment({ ...env });
};

const applyTimeOfDay = (preset: TimeOfDayPreset): void => {
  if (!controller) return;
  Object.assign(env, controller.applyTimeOfDay(preset));
};

const flyTo = (id: CameraViewId): void => {
  controller?.flyToView(id);
};

const activePreset = (): TimeOfDayPreset => {
  if (env.dayNight <= 0.25) return 'night';
  if (env.dayNight >= 0.75) return 'day';
  return 'dusk';
};

const viewLabel = (id: CameraViewId | 'free'): string => {
  if (id === 'free') return '自由视角';
  return views.value.find((v) => v.id === id)?.label ?? id;
};

const exportImage = (): void => {
  if (!controller) return;
  const dataUrl = controller.captureImage();
  const link = document.createElement('a');
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  link.download = `golden-gate-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
  link.href = dataUrl;
  link.click();
};

onMounted(() => {
  if (!canvasContainer.value) return;
  controller = new BridgeSceneController(canvasContainer.value);
  views.value = controller.getCameraViews();
  stats.value = controller.getBridgeStats();
  statsTimer = setInterval(() => {
    if (controller) live.value = controller.getLiveStats();
  }, 400);
});

onBeforeUnmount(() => {
  if (statsTimer !== null) clearInterval(statsTimer);
  statsTimer = null;
  controller?.dispose();
  controller = null;
});
</script>

<template>
  <div class="scene-root">
    <div ref="canvasContainer" class="canvas-container"></div>

    <div class="overlay">
      <h1>金门大桥</h1>
      <p>Golden Gate Bridge · 3D 交互场景</p>
    </div>

    <button
      class="panel-toggle"
      type="button"
      :class="{ collapsed: !panelOpen }"
      @click="panelOpen = !panelOpen"
    >
      {{ panelOpen ? '隐藏面板 ×' : '控制面板 ☰' }}
    </button>

    <aside v-show="panelOpen" class="control-panel">
      <section class="panel-section">
        <h2>环境控制</h2>

        <div class="preset-row">
          <button
            v-for="preset in TIME_PRESETS"
            :key="preset.id"
            type="button"
            class="preset-btn"
            :class="{ active: activePreset() === preset.id }"
            @click="applyTimeOfDay(preset.id)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div v-for="slider in SLIDERS" :key="slider.key" class="slider-row">
          <label>
            <span>{{ slider.label }}</span>
            <span class="slider-value">{{ slider.format(env[slider.key]) }}</span>
          </label>
          <input
            type="range"
            :min="slider.min"
            :max="slider.max"
            :step="slider.step"
            v-model.number="env[slider.key]"
            @input="syncEnvironment"
          />
        </div>
      </section>

      <section class="panel-section">
        <h2>相机视角</h2>
        <div class="view-grid">
          <button
            v-for="view in views"
            :key="view.id"
            type="button"
            class="view-btn"
            :class="{ active: live.viewId === view.id }"
            @click="flyTo(view.id)"
          >
            {{ view.label }}
          </button>
        </div>
        <p class="hint">飞行 / 环绕过程中拖拽画面即可随时中断，回到自由视角。</p>
      </section>

      <section class="panel-section">
        <h2>桥体参数</h2>
        <dl v-if="stats" class="stats-grid">
          <div><dt>桥塔数量</dt><dd>{{ stats.towerCount }} 座</dd></div>
          <div><dt>桥塔高度</dt><dd>{{ stats.towerHeight }} m</dd></div>
          <div><dt>主跨长度</dt><dd>{{ stats.mainSpan }} m</dd></div>
          <div><dt>边跨长度</dt><dd>{{ stats.sideSpan }} m × 2</dd></div>
          <div><dt>桥梁全长</dt><dd>{{ stats.totalLength }} m</dd></div>
          <div><dt>桥面宽度</dt><dd>{{ stats.deckWidth }} m</dd></div>
          <div><dt>桥面距水面</dt><dd>{{ stats.deckHeight }} m</dd></div>
          <div><dt>主缆数量</dt><dd>{{ stats.mainCableCount }} 根</dd></div>
          <div><dt>垂直吊索</dt><dd>{{ stats.suspenderCount }} 根</dd></div>
        </dl>
        <dl class="stats-grid live-stats">
          <div><dt>实时帧率</dt><dd>{{ live.fps }} FPS</dd></div>
          <div>
            <dt>相机坐标</dt>
            <dd>
              X {{ live.cameraX.toFixed(0) }} · Y {{ live.cameraY.toFixed(0) }} · Z
              {{ live.cameraZ.toFixed(0) }}
            </dd>
          </div>
          <div><dt>当前视角</dt><dd>{{ viewLabel(live.viewId) }}</dd></div>
        </dl>
      </section>

      <section class="panel-section">
        <button type="button" class="export-btn" @click="exportImage">
          导出当前画面为图片 (PNG)
        </button>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.scene-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

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

.overlay p {
  margin: 6px 0 0;
  font-size: 0.9rem;
  opacity: 0.75;
  letter-spacing: 1px;
}

.panel-toggle {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 4;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(20, 22, 28, 0.72);
  color: #fff;
  font-size: 0.85rem;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: background 0.2s ease;
}

.panel-toggle:hover {
  background: rgba(240, 74, 0, 0.85);
}

.panel-toggle.collapsed {
  right: 18px;
}

.control-panel {
  position: absolute;
  top: 60px;
  right: 18px;
  z-index: 3;
  width: 290px;
  max-height: calc(100vh - 90px);
  overflow-y: auto;
  padding: 16px;
  border-radius: 14px;
  background: rgba(20, 22, 28, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e8e8ec;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.85rem;
  backdrop-filter: blur(14px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
}

.panel-section {
  padding: 10px 0 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-section:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

.panel-section h2 {
  margin: 0 0 10px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 2px;
  color: #f04a00;
  text-transform: uppercase;
}

.preset-row {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.preset-btn,
.view-btn {
  flex: 1;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #e8e8ec;
  font-size: 0.82rem;
  padding: 7px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover,
.view-btn:hover {
  border-color: rgba(240, 74, 0, 0.7);
  color: #ff8a5c;
}

.preset-btn.active,
.view-btn.active {
  background: #f04a00;
  border-color: #f04a00;
  color: #fff;
}

.slider-row {
  margin-bottom: 10px;
}

.slider-row label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 0.82rem;
}

.slider-value {
  color: #ff8a5c;
  font-variant-numeric: tabular-nums;
}

.slider-row input[type='range'] {
  width: 100%;
  accent-color: #f04a00;
  cursor: pointer;
}

.view-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.hint {
  margin: 8px 0 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
  margin: 0;
}

.stats-grid div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 5px 8px;
}

.stats-grid dt {
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.stats-grid dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #fff;
}

.live-stats {
  grid-template-columns: 1fr;
  margin-top: 10px;
}

.live-stats div {
  background: rgba(240, 74, 0, 0.12);
}

.export-btn {
  width: 100%;
  border: none;
  background: #f04a00;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 1px;
  padding: 11px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.export-btn:hover {
  background: #ff5e1a;
}

.export-btn:active {
  transform: scale(0.98);
}
</style>
