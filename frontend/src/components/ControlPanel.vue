<script setup lang="ts">
import { ref } from 'vue';
import {
  environmentState,
  cameraState,
  bridgeStats,
  exportSceneImage,
} from '../scene/sceneState';
import type { CameraMode } from '../scene/sceneState';

interface CameraOption {
  mode: CameraMode;
  label: string;
}

const cameraOptions: CameraOption[] = [
  { mode: 'free', label: '自由视角' },
  { mode: 'deck', label: '沿桥面' },
  { mode: 'orbit', label: '环绕桥塔' },
  { mode: 'aerial', label: '高空俯瞰' },
];

const collapsed = ref<boolean>(false);

const setDayNight = (night: boolean): void => {
  environmentState.isNight = night;
};
</script>

<template>
  <div class="control-panel" :class="{ collapsed }">
    <div class="panel-header">
      <span>场景控制</span>
      <button class="collapse-btn" @click="collapsed = !collapsed">
        {{ collapsed ? '展开' : '收起' }}
      </button>
    </div>

    <div v-show="!collapsed" class="panel-body">
      <!-- 环境控制 -->
      <section class="panel-section">
        <h3>环境</h3>

        <div class="day-night">
          <button
            :class="{ active: !environmentState.isNight }"
            @click="setDayNight(false)"
          >白天</button>
          <button
            :class="{ active: environmentState.isNight }"
            @click="setDayNight(true)"
          >黑夜</button>
        </div>

        <label class="slider-row" :class="{ disabled: environmentState.isNight }">
          <span>太阳高度 {{ environmentState.sunElevation }}°</span>
          <input
            type="range"
            min="0"
            max="90"
            step="1"
            v-model.number="environmentState.sunElevation"
            :disabled="environmentState.isNight"
          />
        </label>

        <label class="slider-row">
          <span>太阳方位 {{ environmentState.sunAzimuth }}°</span>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            v-model.number="environmentState.sunAzimuth"
          />
        </label>

        <label class="slider-row">
          <span>雾气浓度 {{ environmentState.fogDensity.toFixed(4) }}</span>
          <input
            type="range"
            min="0"
            max="0.005"
            step="0.0001"
            v-model.number="environmentState.fogDensity"
          />
        </label>

        <label class="slider-row">
          <span>海洋波纹 {{ environmentState.waveIntensity.toFixed(1) }}</span>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            v-model.number="environmentState.waveIntensity"
          />
        </label>

        <label class="slider-row">
          <span>画面曝光 {{ environmentState.exposure.toFixed(2) }}</span>
          <input
            type="range"
            min="0.1"
            max="1.5"
            step="0.01"
            v-model.number="environmentState.exposure"
          />
        </label>
      </section>

      <!-- 相机视角 -->
      <section class="panel-section">
        <h3>相机视角</h3>
        <div class="camera-modes">
          <button
            v-for="option in cameraOptions"
            :key="option.mode"
            :class="{ active: cameraState.mode === option.mode }"
            @click="cameraState.mode = option.mode"
          >{{ option.label }}</button>
        </div>
      </section>

      <!-- 导出 -->
      <section class="panel-section">
        <button class="export-btn" @click="exportSceneImage">导出为图片</button>
      </section>

      <!-- 桥体参数 -->
      <section class="panel-section">
        <h3>桥体参数</h3>
        <dl class="stats-grid">
          <div><dt>桥塔高度</dt><dd>{{ bridgeStats.towerHeight }} m</dd></div>
          <div><dt>主跨长度</dt><dd>{{ bridgeStats.mainSpan }} m</dd></div>
          <div><dt>边跨长度</dt><dd>{{ bridgeStats.sideSpan }} m</dd></div>
          <div><dt>桥面全长</dt><dd>{{ bridgeStats.totalLength }} m</dd></div>
          <div><dt>桥面高度</dt><dd>{{ bridgeStats.deckHeight }} m</dd></div>
          <div><dt>桥面宽度</dt><dd>{{ bridgeStats.deckWidth }} m</dd></div>
          <div><dt>主缆长度</dt><dd>{{ bridgeStats.cableLength }} m</dd></div>
          <div><dt>吊索数量</dt><dd>{{ bridgeStats.suspenderCount }}</dd></div>
        </dl>
      </section>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  width: 280px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  background: rgba(12, 16, 24, 0.78);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #e8ecf1;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  font-weight: 600;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.control-panel.collapsed .panel-header {
  border-bottom: none;
}

.collapse-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: inherit;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}

.panel-body {
  padding: 4px 14px 14px;
}

.panel-section {
  margin-top: 12px;
}

.panel-section h3 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: #9fb4c8;
  letter-spacing: 2px;
}

.day-night {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.day-night button,
.camera-modes button {
  flex: 1;
  padding: 6px 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.day-night button:hover,
.camera-modes button:hover {
  background: rgba(255, 255, 255, 0.16);
}

.day-night button.active,
.camera-modes button.active {
  background: rgba(240, 74, 0, 0.35);
  border-color: #f04a00;
}

.slider-row {
  display: block;
  margin-bottom: 10px;
}

.slider-row span {
  display: block;
  margin-bottom: 4px;
  color: #c8d2dc;
}

.slider-row.disabled span {
  color: #66707c;
}

.slider-row input[type='range'] {
  width: 100%;
  accent-color: #f04a00;
}

.camera-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.export-btn {
  width: 100%;
  padding: 8px 0;
  background: #f04a00;
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.export-btn:hover {
  background: #ff5c1a;
}

.stats-grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
}

.stats-grid div {
  display: flex;
  justify-content: space-between;
}

.stats-grid dt {
  color: #9fb4c8;
}

.stats-grid dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
</style>
