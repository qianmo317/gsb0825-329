// Shared strong types for the Golden Gate interactive scene.

/**
 * Live-adjustable environment parameters. Every field maps directly to a
 * value that was previously hard-coded in the scene, so the defaults defined
 * in `bridgeConfig.ts` reproduce the original look exactly.
 */
export interface EnvironmentSettings {
  /** Sun elevation fraction, feeds `theta = PI * (sunElevation - 0.5)`. */
  sunElevation: number;
  /** Sun azimuth fraction, feeds `phi = 2*PI * (sunAzimuth - 0.5)`. */
  sunAzimuth: number;
  /** Exponential fog density on the `FogExp2` instance. */
  fogDensity: number;
  /** Ocean ripple strength (`Water` uniform `distortionScale`). */
  waterDistortion: number;
  /** Renderer tone-mapping exposure. */
  exposure: number;
}

/** Preset day / night looks applied on top of the environment sliders. */
export type DayNightPreset = 'day' | 'night';

/** Identifiers for the cinematic camera viewpoints. */
export type CameraViewId = 'free' | 'alongDeck' | 'aroundTower' | 'aerial';

/** Static structural parameters of the generated bridge (metres, scaled). */
export interface BridgeParams {
  towerHeight: number;
  towerWidth: number;
  towerDepth: number;
  span: number;
  sideSpan: number;
  deckHeight: number;
  deckWidth: number;
  totalLength: number;
}

/** Real-time camera state pushed to the UI every frame. */
export interface CameraReadout {
  x: number;
  y: number;
  z: number;
  /** Distance from camera to the current orbit target. */
  distance: number;
  /** Sun altitude in degrees derived from the current sun vector. */
  sunAltitudeDeg: number;
  /** Currently active cinematic view (or 'free' when manually orbiting). */
  view: CameraViewId;
}

/** A camera pose used by the cinematic fly-to transitions. */
export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}
