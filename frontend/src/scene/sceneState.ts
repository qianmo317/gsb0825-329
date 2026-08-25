import { reactive } from 'vue';

/** 相机飞行模式 */
export type CameraMode = 'free' | 'deck' | 'orbit' | 'aerial';

/** 环境控制状态（默认值与场景初始效果保持一致） */
export interface EnvironmentState {
  /** 太阳高度角（度），0-90，默认 9 与原场景初始光照一致 */
  sunElevation: number;
  /** 太阳方位角（度），0-360，默认 180 与原场景初始光照一致 */
  sunAzimuth: number;
  /** 是否夜晚模式 */
  isNight: boolean;
  /** 雾气浓度（FogExp2 density） */
  fogDensity: number;
  /** 海洋波纹强度（Water distortionScale） */
  waveIntensity: number;
  /** 画面曝光（toneMappingExposure） */
  exposure: number;
}

/** 桥体结构参数（由场景构建时实测填充） */
export interface BridgeStats {
  /** 桥塔高度（水面以上） */
  towerHeight: number;
  /** 主跨长度（两塔间距） */
  mainSpan: number;
  /** 单侧边跨长度 */
  sideSpan: number;
  /** 桥面全长 */
  totalLength: number;
  /** 桥面距水面高度 */
  deckHeight: number;
  /** 桥面宽度 */
  deckWidth: number;
  /** 单根主缆长度（曲线实测） */
  cableLength: number;
  /** 吊索数量 */
  suspenderCount: number;
}

export const environmentState = reactive<EnvironmentState>({
  sunElevation: 9,
  sunAzimuth: 180,
  isNight: false,
  fogDensity: 0.0015,
  waveIntensity: 3.7,
  exposure: 0.5,
});

export const cameraState = reactive<{ mode: CameraMode }>({
  mode: 'free',
});

export const bridgeStats = reactive<BridgeStats>({
  towerHeight: 0,
  mainSpan: 0,
  sideSpan: 0,
  totalLength: 0,
  deckHeight: 0,
  deckWidth: 0,
  cableLength: 0,
  suspenderCount: 0,
});

type ExportHandler = () => void;

let exportHandler: ExportHandler | null = null;

/** 由场景组件注册实际的导出实现 */
export function registerExportHandler(handler: ExportHandler): void {
  exportHandler = handler;
}

/** 由控制面板触发导出 */
export function exportSceneImage(): void {
  exportHandler?.();
}
