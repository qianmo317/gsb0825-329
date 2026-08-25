<script setup lang="ts">
import { reactive, ref } from 'vue';
import { DEFAULT_ENVIRONMENT } from '../three/bridgeConfig';
import type {
  BridgeParams,
  CameraReadout,
  CameraViewId,
  DayNightPreset,
  EnvironmentSettings,
} from '../three/types';

const props = defineProps<{
  bridge: BridgeParams;
  readout: CameraReadout | null;
}>();

const emit = defineEmits<{
  (e: 'update-environment', patch: Partial<EnvironmentSettings>): void;
  (e: 'apply-preset', preset: DayNightPreset): void;
  (e: 'fly-to', view: CameraViewId): void;
  (e: 'export-image'): void;
}>();

// Local mirror of environment sliders (state of truth stays in the world;
// this only reflects UI values and is re-synced when presets are applied).
const env = reactive<EnvironmentSettings>({ ...DEFAULT_ENVIRONMENT });
const collapsed = ref(false);

const VIEWS: ReadonlyArray<{ id: CameraViewId; label: string }> = [
  { id: 'alongDeck', label: '沿桥面' },
  { id: 'aroundTower', label: '环绕桥塔' },
  { id: 'aerial', label: '高空俯瞰' },
  { id: 'free', label: '自由视角' },
];

/** Push a single field change up to the world. */
function onEnv<K extends keyof EnvironmentSettings>(key: K, value: number): void {
  env[key] = value;
  emit('update-environment', { [key]: value } as Partial<EnvironmentSettings>);
}

function onPreset(preset: DayNightPreset): void {
  emit('apply-preset', preset);
}

/** Called by the parent after a preset re-computes settings, to sync sliders. */
function syncFromSettings(next: EnvironmentSettings): void {
  Object.assign(env, next);
}

defineExpose({ syncFromSettings });

const fmt = (n: number, d = 1): string => n.toFixed(d);
</script>

<template>
  <div class="control-panel" :class="{ collapsed }">
    <div class="panel-header">
      <span>交互控制</span>
      <button class="collapse-btn" @click="collapsed = !collapsed">
        {{ collapsed ? '展开' : '收起' }}
      </button>
    </div>

    <div v-show="!collapsed" class="panel-body">
      <!-- Environment -->
      <section>
        <h3>环境</h3>

        <label>
          <span>太阳高度</span>
          <input
            type="range" min="0.01" max="0.99" step="0.001"
            :value="env.sunElevation"
            @input="onEnv('sunElevation', +($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          <span>太阳方位</span>
          <input
            type="range" min="0" max="1" step="0.001"
            :value="env.sunAzimuth"
            @input="onEnv('sunAzimuth', +($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          <span>雾气浓度</span>
          <input
            type="range" min="0" max="0.01" step="0.0001"
            :value="env.fogDensity"
            @input="onEnv('fogDensity', +($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          <span>海洋波纹</span>
          <input
            type="range" min="0" max="12" step="0.1"
            :value="env.waterDistortion"
            @input="onEnv('waterDistortion', +($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          <span>画面曝光</span>
          <input
            type="range" min="0.05" max="1.5" step="0.01"
            :value="env.exposure"
            @input="onEnv('exposure', +($event.target as HTMLInputElement).value)"
          />
        </label>

        <div class="preset-row">
          <button @click="onPreset('day')">白天</button>
          <button @click="onPreset('night')">黑夜</button>
        </div>
      </section>

      <!-- Camera -->
      <section>
        <h3>相机视角</h3>
        <div class="view-grid">
          <button
            v-for="v in VIEWS"
            :key="v.id"
            :class="{ active: readout?.view === v.id }"
            @click="emit('fly-to', v.id)"
          >
            {{ v.label }}
          </button>
        </div>
      </section>

      <!-- Export -->
      <section>
        <button class="export-btn" @click="emit('export-image')">
          导出为图片
        </button>
      </section>

      <!-- Live params -->
      <section class="readout">
        <h3>实时参数</h3>
        <div class="row"><span>桥体总长</span><b>{{ bridge.totalLength }} m</b></div>
        <div class="row"><span>主跨</span><b>{{ bridge.span }} m</b></div>
        <div class="row"><span>桥塔高度</span><b>{{ bridge.towerHeight }} m</b></div>
        <div class="row"><span>桥面高度</span><b>{{ bridge.deckHeight }} m</b></div>
        <div class="row"><span>桥面宽度</span><b>{{ bridge.deckWidth }} m</b></div>
        <template v-if="readout">
          <div class="row"><span>相机 X</span><b>{{ fmt(readout.x) }}</b></div>
          <div class="row"><span>相机 Y</span><b>{{ fmt(readout.y) }}</b></div>
          <div class="row"><span>相机 Z</span><b>{{ fmt(readout.z) }}</b></div>
          <div class="row"><span>观察距离</span><b>{{ fmt(readout.distance) }}</b></div>
          <div class="row"><span>太阳仰角</span><b>{{ fmt(readout.sunAltitudeDeg) }}°</b></div>
        </template>
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
  width: 260px;
  background: rgba(18, 20, 26, 0.72);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: #e9edf2;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  font-weight: 600;
  letter-spacing: 1px;
  background: rgba(240, 74, 0, 0.18);
}

.collapse-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: inherit;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
}

.panel-body {
  padding: 8px 14px 14px;
  max-height: 80vh;
  overflow-y: auto;
}

section {
  padding: 10px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
section:first-child {
  border-top: none;
}

h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #f0a070;
}

label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
label span {
  flex: 0 0 60px;
  color: #b9c2cc;
}
label input[type='range'] {
  flex: 1;
  accent-color: #f04a00;
}

.preset-row,
.view-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

button {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #e9edf2;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
button:hover {
  background: rgba(240, 74, 0, 0.25);
}
button.active {
  background: rgba(240, 74, 0, 0.55);
  border-color: #f04a00;
}

.export-btn {
  width: 100%;
  background: rgba(240, 74, 0, 0.35);
  border-color: #f04a00;
  font-weight: 600;
}

.readout .row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  color: #b9c2cc;
}
.readout .row b {
  color: #fff;
  font-variant-numeric: tabular-nums;
}
</style>
