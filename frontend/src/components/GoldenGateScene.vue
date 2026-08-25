<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, reactive, watch, computed } from 'vue';
import { BridgeScene } from '../scene/BridgeScene';
import {
  DEFAULT_ENV_STATE,
  DEFAULT_STATS,
  type BridgeParams,
  type CameraViewName,
  type EnvState,
  type RuntimeStats,
} from '../scene/types';

type ViewName = CameraViewName | 'free';

const canvasContainer = ref<HTMLDivElement | null>(null);
const bridgeScene = ref<BridgeScene | null>(null);

const envState = reactive<EnvState>({ ...DEFAULT_ENV_STATE });
const runtimeStats = reactive<RuntimeStats>({ ...DEFAULT_STATS });
const bridgeParams = ref<BridgeParams | null>(null);

const panelOpen = ref(true);
const activeView = ref<ViewName>('default');

const sunElevationLabel = computed(() => `${envState.sunElevationDeg.toFixed(0)}°`);
const sunAzimuthLabel = computed(() => `${envState.sunAzimuthDeg.toFixed(0)}°`);
const dayNightLabel = computed(() => {
  const v = envState.dayNight;
  if (v < 0.25) return '深夜';
  if (v < 0.5) return '黎明/黄昏';
  if (v < 0.75) return '白天';
  return '正午';
});
const fogLabel = computed(() => (envState.fogDensity * 1000).toFixed(2));
const distortionLabel = computed(() => envState.waterDistortion.toFixed(1));
const exposureLabel = computed(() => envState.exposure.toFixed(2));

const meters = (units: number): string => (units * 2.7).toFixed(0);

onMounted(() => {
  if (!canvasContainer.value) return;
  const scene = new BridgeScene();
  bridgeScene.value = scene;
  scene.mount(canvasContainer.value);
  bridgeParams.value = scene.getBridgeParams();
  scene.onStatsUpdate((stats) => {
    Object.assign(runtimeStats, stats);
  });
  scene.onViewInterrupt(() => {
    activeView.value = 'free';
  });
});

watch(
  envState,
  (value) => {
    bridgeScene.value?.setEnv({ ...value });
  },
  { deep: true }
);

const flyToView = (name: CameraViewName): void => {
  activeView.value = name;
  bridgeScene.value?.flyToView(name);
};

const resetView = (): void => {
  flyToView('default');
};

const exportImage = (): void => {
  bridgeScene.value?.exportImage();
};

onBeforeUnmount(() => {
  bridgeScene.value?.dispose();
  bridgeScene.value = null;
});
</script>

<template>
  <div ref="canvasContainer" class="canvas-container"></div>

  <div class="overlay">
    <h1>金门大桥</h1>
    <p class="subtitle">Golden Gate Bridge · 3D Interactive Scene</p>
  </div>

  <div class="toggle-panel-btn" @click="panelOpen = !panelOpen">
    <span v-if="panelOpen">收起面板</span>
    <span v-else>展开面板</span>
  </div>

  <aside class="control-panel" :class="{ collapsed: !panelOpen }">
    <div class="panel-header">
      <h2>交互控制台</h2>
      <button class="close-btn" @click="panelOpen = false">×</button>
    </div>

    <div class="panel-body">
      <section class="panel-section">
        <h3>相机视角</h3>
        <div class="view-buttons">
          <button
            :class="{ active: activeView === 'default' }"
            @click="flyToView('default')"
          >
            默认视角
          </button>
          <button
            :class="{ active: activeView === 'deck' }"
            @click="flyToView('deck')"
          >
            沿桥面
          </button>
          <button
            :class="{ active: activeView === 'tower' }"
            @click="flyToView('tower')"
          >
            环绕桥塔
          </button>
          <button
            :class="{ active: activeView === 'overhead' }"
            @click="flyToView('overhead')"
          >
            高空俯瞰
          </button>
        </div>
        <button v-if="activeView === 'free'" class="reset-btn" @click="resetView">
          回到默认
        </button>
      </section>

      <section class="panel-section">
        <h3>太阳高度</h3>
        <div class="slider-row">
          <input
            type="range"
            min="-90"
            max="90"
            step="1"
            v-model.number="envState.sunElevationDeg"
          />
          <span class="slider-value">{{ sunElevationLabel }}</span>
        </div>
      </section>

      <section class="panel-section">
        <h3>太阳方位</h3>
        <div class="slider-row">
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            v-model.number="envState.sunAzimuthDeg"
          />
          <span class="slider-value">{{ sunAzimuthLabel }}</span>
        </div>
      </section>

      <section class="panel-section">
        <h3>白天 / 黑夜</h3>
        <div class="slider-row">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            v-model.number="envState.dayNight"
          />
          <span class="slider-value">{{ dayNightLabel }}</span>
        </div>
      </section>

      <section class="panel-section">
        <h3>雾气浓度</h3>
        <div class="slider-row">
          <input
            type="range"
            min="0"
            max="0.01"
            step="0.0001"
            v-model.number="envState.fogDensity"
          />
          <span class="slider-value">{{ fogLabel }}</span>
        </div>
      </section>

      <section class="panel-section">
        <h3>海洋波纹</h3>
        <div class="slider-row">
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            v-model.number="envState.waterDistortion"
          />
          <span class="slider-value">{{ distortionLabel }}</span>
        </div>
      </section>

      <section class="panel-section">
        <h3>画面曝光</h3>
        <div class="slider-row">
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            v-model.number="envState.exposure"
          />
          <span class="slider-value">{{ exposureLabel }}</span>
        </div>
      </section>

      <section class="panel-section">
        <h3>导出</h3>
        <button class="export-btn" @click="exportImage">
          导出当前画面为 PNG
        </button>
      </section>
    </div>
  </aside>

  <div v-if="bridgeParams" class="info-panel">
    <h3>桥体参数</h3>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">主跨</span>
        <span class="info-value">{{ meters(bridgeParams.mainSpan) }} m</span>
      </div>
      <div class="info-item">
        <span class="info-label">边跨</span>
        <span class="info-value">{{ meters(bridgeParams.sideSpan) }} m</span>
      </div>
      <div class="info-item">
        <span class="info-label">总长</span>
        <span class="info-value">{{ meters(bridgeParams.totalLength) }} m</span>
      </div>
      <div class="info-item">
        <span class="info-label">桥塔高</span>
        <span class="info-value">{{ meters(bridgeParams.towerHeight) }} m</span>
      </div>
      <div class="info-item">
        <span class="info-label">桥面高</span>
        <span class="info-value">{{ meters(bridgeParams.deckY) }} m</span>
      </div>
      <div class="info-item">
        <span class="info-label">桥面宽</span>
        <span class="info-value">{{ meters(bridgeParams.deckWidth) }} m</span>
      </div>
      <div class="info-item">
        <span class="info-label">桥塔数</span>
        <span class="info-value">{{ bridgeParams.towerCount }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">主缆数</span>
        <span class="info-value">{{ bridgeParams.mainCableCount }}</span>
      </div>
    </div>
    <div class="runtime-stats">
      <div class="info-item">
        <span class="info-label">FPS</span>
        <span class="info-value">{{ runtimeStats.fps }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">相机 X</span>
        <span class="info-value">{{ runtimeStats.cameraX.toFixed(1) }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">相机 Y</span>
        <span class="info-value">{{ runtimeStats.cameraY.toFixed(1) }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">相机 Z</span>
        <span class="info-value">{{ runtimeStats.cameraZ.toFixed(1) }}</span>
      </div>
    </div>
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

.subtitle {
  margin: 4px 0 0;
  font-size: 0.85rem;
  opacity: 0.7;
  letter-spacing: 1px;
}

.toggle-panel-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  background: rgba(20, 25, 35, 0.85);
  color: #e0e0e0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  backdrop-filter: blur(10px);
  transition: background 0.2s;
}

.toggle-panel-btn:hover {
  background: rgba(40, 50, 70, 0.95);
}

.control-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 300px;
  height: 100vh;
  z-index: 9;
  background: rgba(15, 20, 30, 0.88);
  backdrop-filter: blur(14px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  color: #e0e0e0;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  display: flex;
  flex-direction: column;
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.control-panel.collapsed {
  transform: translateX(100%);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-header h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 1px;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.close-btn:hover {
  color: #fff;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.panel-section {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.panel-section h3 {
  margin: 0 0 10px;
  font-size: 0.78rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #8899aa;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-row input[type='range'] {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  outline: none;
}

.slider-row input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f04a00;
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.slider-row input[type='range']::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f04a00;
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.slider-value {
  min-width: 52px;
  text-align: right;
  font-size: 0.82rem;
  color: #b0c0d0;
  font-variant-numeric: tabular-nums;
}

.view-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.view-buttons button {
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 9px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.view-buttons button:hover {
  background: rgba(240, 74, 0, 0.2);
  border-color: rgba(240, 74, 0, 0.5);
  color: #fff;
}

.view-buttons button.active {
  background: rgba(240, 74, 0, 0.35);
  border-color: #f04a00;
  color: #fff;
}

.reset-btn {
  margin-top: 10px;
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8rem;
}

.reset-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.export-btn {
  width: 100%;
  background: linear-gradient(135deg, #f04a00, #d63a00);
  color: #fff;
  border: none;
  padding: 11px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.5px;
  transition: transform 0.15s, box-shadow 0.15s;
}

.export-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(240, 74, 0, 0.4);
}

.info-panel {
  position: absolute;
  bottom: 30px;
  right: 330px;
  z-index: 8;
  background: rgba(15, 20, 30, 0.82);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 16px 18px;
  color: #e0e0e0;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  min-width: 220px;
  transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s;
}

.control-panel.collapsed ~ .info-panel {
  right: 30px;
}

.info-panel h3 {
  margin: 0 0 12px;
  font-size: 0.78rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #8899aa;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  margin-bottom: 12px;
}

.runtime-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.info-label {
  color: #7a8a9a;
}

.info-value {
  color: #d0dce8;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

@media (max-width: 768px) {
  .control-panel {
    width: 100%;
  }
  .info-panel {
    display: none;
  }
}
</style>
