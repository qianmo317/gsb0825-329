export interface EnvState {
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  dayNight: number;
  fogDensity: number;
  waterDistortion: number;
  exposure: number;
}

export interface BridgeParams {
  readonly towerHeight: number;
  readonly towerWidth: number;
  readonly towerDepth: number;
  readonly mainSpan: number;
  readonly sideSpan: number;
  readonly deckY: number;
  readonly deckWidth: number;
  readonly deckThickness: number;
  readonly towerCount: number;
  readonly mainCableCount: number;
  readonly suspenderDiameter: number;
  readonly totalLength: number;
}

export interface RuntimeStats {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fps: number;
}

export type CameraViewName = 'default' | 'deck' | 'tower' | 'overhead';

export const DEFAULT_ENV_STATE: EnvState = {
  sunElevationDeg: -9,
  sunAzimuthDeg: 90,
  dayNight: 1,
  fogDensity: 0.0015,
  waterDistortion: 3.7,
  exposure: 0.5,
};

export const DEFAULT_STATS: RuntimeStats = {
  cameraX: 0,
  cameraY: 0,
  cameraZ: 0,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  fps: 0,
};
