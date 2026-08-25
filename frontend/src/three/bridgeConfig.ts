import type {
  BridgeParams,
  CameraPose,
  CameraViewId,
  EnvironmentSettings,
} from './types';

/**
 * Default environment values. These are copied verbatim from the original
 * hard-coded scene so that mounting the component with no user interaction
 * yields a pixel-identical result to before the control system was added.
 */
export const DEFAULT_ENVIRONMENT: Readonly<EnvironmentSettings> = {
  sunElevation: 0.45, // original: `0.45 - 0.5` elevation term
  sunAzimuth: 0.25, // original: `0.25 - 0.5` azimuth term
  fogDensity: 0.0015, // original FogExp2 density
  waterDistortion: 3.7, // original Water `distortionScale`
  exposure: 0.5, // original renderer.toneMappingExposure
};

/** Static bridge dimensions, extracted from the original `buildBridge`. */
export const BRIDGE_PARAMS: Readonly<BridgeParams> = (() => {
  const span = 400;
  const sideSpan = 150;
  return {
    towerHeight: 100,
    towerWidth: 10,
    towerDepth: 6,
    span,
    sideSpan,
    deckHeight: 25,
    deckWidth: 34,
    totalLength: span + sideSpan * 2,
  };
})();

/** Material colours (unchanged from the original scene). */
export const COLORS = {
  bridge: 0xf04a00, // International Orange
  road: 0x333333,
  cable: 0xf04a00,
} as const;

/**
 * Static cinematic camera poses used by the "fly there and stop" views.
 * `free` mirrors the original starting camera so the "reset" view is
 * indistinguishable from the untouched scene. `aerial` is a fixed overview.
 *
 * The `alongDeck` / `aroundTower` entries are the *entry* poses only: the
 * camera flies to these first, then a sustained motion (see `CAMERA_MOTION`)
 * takes over. They are derived from `motionPose(view, 0)` at runtime, so the
 * values here are documentation / fallback and never cause a visual jump.
 */
export const CAMERA_POSES: Readonly<Record<CameraViewId, CameraPose>> = {
  free: {
    position: [30, 30, 100],
    target: [0, 10, 0],
  },
  alongDeck: {
    position: [0, 42, 48],
    target: [66, 28, 0],
  },
  aroundTower: {
    position: [-50, 90, 0],
    target: [-200, 65, 0],
  },
  aerial: {
    // High bird's-eye overview of the whole span.
    position: [0, 520, 480],
    target: [0, 25, 0],
  },
};

/**
 * Parameters for the two *animated* cinematic views. Kept here so all camera
 * tuning lives in one place. Distances / polar angles are chosen to stay
 * within the OrbitControls limits (min 40, max 2000, above the horizon).
 */
export const CAMERA_MOTION = {
  /** Continuous orbit around the north tower. */
  aroundTower: {
    towerX: -BRIDGE_PARAMS.span / 2, // north tower at x = -200
    radius: 150,
    height: 90,
    targetHeight: 65,
    angularSpeed: 0.3, // radians / second
  },
  /** Back-and-forth cruise along the deck, looking down the roadway. */
  alongDeck: {
    amplitude: 320, // half of the travelled length along X
    speed: 0.35, // radians / second of the sine sweep
    height: 42,
    zOffset: 48, // sideways offset from the deck centre-line
    lead: 0.6, // seconds the look-at point leads the camera by
    targetHeight: 28,
  },
} as const;
