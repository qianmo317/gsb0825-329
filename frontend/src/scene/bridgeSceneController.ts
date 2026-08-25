import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

/** Realtime-adjustable environment parameters. */
export interface EnvironmentParams {
  /** Sun elevation in degrees, -20 (below horizon) ~ 90 (zenith). */
  sunElevation: number;
  /** Sun azimuth in degrees, 0 ~ 360. */
  sunAzimuth: number;
  /** Day / night blend: 0 = deep night, 0.5 = dusk (default look), 1 = noon. */
  dayNight: number;
  /** Exponential fog density (FogExp2). */
  fogDensity: number;
  /** Ocean ripple strength, mapped to Water distortionScale. */
  waveStrength: number;
  /** Renderer tone mapping exposure. */
  exposure: number;
}

export type TimeOfDayPreset = 'night' | 'dusk' | 'day';

export type CameraViewId = 'default' | 'deck' | 'towerOrbit' | 'aerial';

export interface CameraViewInfo {
  id: CameraViewId;
  label: string;
}

/** Static structural parameters of the bridge model. */
export interface BridgeStats {
  towerHeight: number;
  towerCount: number;
  mainSpan: number;
  sideSpan: number;
  totalLength: number;
  deckWidth: number;
  deckHeight: number;
  mainCableCount: number;
  suspenderCount: number;
}

/** Per-frame live stats surfaced to the UI. */
export interface LiveStats {
  fps: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  viewId: CameraViewId | 'free';
}

/* ------------------------------------------------------------------ */
/* Constants (scaled Golden Gate dimensions)                           */
/* ------------------------------------------------------------------ */

const BRIDGE_COLOR = 0xf04a00; // International Orange
const ROAD_COLOR = 0x333333;
const CABLE_COLOR = 0xf04a00;

const TOWER_HEIGHT = 100;
const TOWER_WIDTH = 10;
const TOWER_DEPTH = 6;
const MAIN_SPAN = 400;
const SIDE_SPAN = 150;
const DECK_Y = 25;
const DECK_WIDTH = 34;
const TOTAL_LENGTH = MAIN_SPAN + SIDE_SPAN * 2;

/**
 * Default environment. These values reproduce the original scene exactly
 * (sun elevation 9° / azimuth 180°, dusk atmosphere, fog 0.0015,
 * distortionScale 3.7, exposure 0.5).
 */
export const DEFAULT_ENVIRONMENT: EnvironmentParams = {
  sunElevation: 9,
  sunAzimuth: 180,
  dayNight: 0.5,
  fogDensity: 0.0015,
  waveStrength: 3.7,
  exposure: 0.5,
};

interface AtmosphereKeyframe {
  ambientColor: number;
  ambientIntensity: number;
  dirColor: number;
  dirIntensity: number;
  fogColor: number;
  waterColor: number;
  rayleigh: number;
  turbidity: number;
  starsOpacity: number;
}

const ATMOSPHERE_NIGHT: AtmosphereKeyframe = {
  ambientColor: 0x2c3d6b,
  ambientIntensity: 0.12,
  dirColor: 0x9db8ff,
  dirIntensity: 0.25,
  fogColor: 0x0a1024,
  waterColor: 0x01060f,
  rayleigh: 0.4,
  turbidity: 10,
  starsOpacity: 1,
};

const ATMOSPHERE_DUSK: AtmosphereKeyframe = {
  ambientColor: 0xcccccc,
  ambientIntensity: 0.4,
  dirColor: 0xffaa33,
  dirIntensity: 1.0,
  fogColor: 0xefd1b5,
  waterColor: 0x001e0f,
  rayleigh: 2,
  turbidity: 10,
  starsOpacity: 0,
};

const ATMOSPHERE_DAY: AtmosphereKeyframe = {
  ambientColor: 0xffffff,
  ambientIntensity: 0.55,
  dirColor: 0xfff0cc,
  dirIntensity: 1.25,
  fogColor: 0xd9e9f7,
  waterColor: 0x0d4a6b,
  rayleigh: 1.4,
  turbidity: 6,
  starsOpacity: 0,
};

type CameraMode = 'free' | 'tween' | 'path';

interface CameraFrame {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

interface CameraViewDef {
  id: CameraViewId;
  label: string;
  kind: 'static' | 'path';
  pathSpeed: number;
  getFrame: (u: number) => CameraFrame;
}

interface CameraTween {
  elapsed: number;
  duration: number;
  startPos: THREE.Vector3;
  startLook: THREE.Vector3;
  endPos: THREE.Vector3;
  endLook: THREE.Vector3;
  nextKind: 'static' | 'path';
}

const TWEEN_DURATION = 1.8;

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function lerpKeyframe(
  a: AtmosphereKeyframe,
  b: AtmosphereKeyframe,
  t: number,
  out: AtmosphereKeyframe,
  colorA: THREE.Color,
  colorB: THREE.Color,
): AtmosphereKeyframe {
  const mixColor = (hexA: number, hexB: number): number =>
    colorA.setHex(hexA).lerp(colorB.setHex(hexB), t).getHex();

  out.ambientColor = mixColor(a.ambientColor, b.ambientColor);
  out.dirColor = mixColor(a.dirColor, b.dirColor);
  out.fogColor = mixColor(a.fogColor, b.fogColor);
  out.waterColor = mixColor(a.waterColor, b.waterColor);
  out.ambientIntensity = lerp(a.ambientIntensity, b.ambientIntensity, t);
  out.dirIntensity = lerp(a.dirIntensity, b.dirIntensity, t);
  out.rayleigh = lerp(a.rayleigh, b.rayleigh, t);
  out.turbidity = lerp(a.turbidity, b.turbidity, t);
  out.starsOpacity = lerp(a.starsOpacity, b.starsOpacity, t);
  return out;
}

/** Generate a noise texture used as water normals. */
function createWaterNormals(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#8080ff';
    context.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random() * 255;
      const g = Math.random() * 255;
      context.fillStyle = `rgb(${r}, ${g}, 255)`;
      context.fillRect(x, y, 2, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/* ------------------------------------------------------------------ */
/* Controller                                                          */
/* ------------------------------------------------------------------ */

export class BridgeSceneController {
  private readonly container: HTMLElement;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private water!: Water;
  private sky!: Sky;
  private stars!: THREE.Points;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;
  private fog!: THREE.FogExp2;
  private pmremGenerator!: THREE.PMREMGenerator;
  private sceneEnv!: THREE.Scene;
  private renderTarget: THREE.WebGLRenderTarget | null = null;

  private readonly sun = new THREE.Vector3();
  private readonly clock = new THREE.Clock();
  private animationId = 0;
  private disposed = false;

  private envParams: EnvironmentParams = { ...DEFAULT_ENVIRONMENT };
  private envDirty = true;

  private bridgeStats: BridgeStats = {
    towerHeight: TOWER_HEIGHT,
    towerCount: 2,
    mainSpan: MAIN_SPAN,
    sideSpan: SIDE_SPAN,
    totalLength: TOTAL_LENGTH,
    deckWidth: DECK_WIDTH,
    deckHeight: DECK_Y,
    mainCableCount: 2,
    suspenderCount: 0,
  };

  private readonly views: CameraViewDef[];

  private cameraMode: CameraMode = 'free';
  private activeView: CameraViewId | null = null;
  private tween: CameraTween | null = null;
  private pathU = 0;

  private fps = 0;
  private frameCount = 0;
  private fpsElapsed = 0;

  private readonly tmpKeyframe: AtmosphereKeyframe = {
    ambientColor: 0,
    ambientIntensity: 0,
    dirColor: 0,
    dirIntensity: 0,
    fogColor: 0,
    waterColor: 0,
    rayleigh: 0,
    turbidity: 0,
    starsOpacity: 0,
  };
  private readonly tmpColorA = new THREE.Color();
  private readonly tmpColorB = new THREE.Color();

  constructor(container: HTMLElement) {
    this.container = container;
    this.views = this.buildViews();
    this.initScene();
    this.animate();
  }

  /* ------------------------------ setup --------------------------- */

  private initScene(): void {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      1,
      20000,
    );
    this.camera.position.set(30, 30, 100);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.envParams.exposure;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(0, 10, 0);
    this.controls.minDistance = 40;
    this.controls.maxDistance = 2000;
    this.controls.update();
    // While flying, OrbitControls is disabled and never emits its own
    // 'start' event, so listen on the canvas directly to cancel auto
    // motion on user interaction.
    this.renderer.domElement.addEventListener('pointerdown', this.onUserInteract);

    // Sky
    this.sky = new Sky();
    this.sky.scale.setScalar(10000);
    this.scene.add(this.sky);
    const skyUniforms = (this.sky.material as THREE.ShaderMaterial).uniforms;
    skyUniforms['turbidity']!.value = ATMOSPHERE_DUSK.turbidity;
    skyUniforms['rayleigh']!.value = ATMOSPHERE_DUSK.rayleigh;
    skyUniforms['mieCoefficient']!.value = 0.005;
    skyUniforms['mieDirectionalG']!.value = 0.8;

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.sceneEnv = new THREE.Scene();

    // Water
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    this.water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: createWaterNormals(),
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: ATMOSPHERE_DUSK.waterColor,
      distortionScale: this.envParams.waveStrength,
      fog: this.scene.fog !== undefined,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    // Lighting
    this.ambientLight = new THREE.AmbientLight(
      ATMOSPHERE_DUSK.ambientColor,
      ATMOSPHERE_DUSK.ambientIntensity,
    );
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(
      ATMOSPHERE_DUSK.dirColor,
      ATMOSPHERE_DUSK.dirIntensity,
    );
    this.dirLight.position.set(-1, 1, 1);
    this.scene.add(this.dirLight);

    // Fog
    this.fog = new THREE.FogExp2(ATMOSPHERE_DUSK.fogColor, this.envParams.fogDensity);
    this.scene.fog = this.fog;

    // Stars (hidden by default, only visible at night)
    this.stars = this.buildStars();
    this.scene.add(this.stars);

    this.buildBridge();

    window.addEventListener('resize', this.onWindowResize);
  }

  private buildStars(): THREE.Points {
    const count = 1200;
    const positions = new Float32Array(count * 3);
    const direction = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      direction.randomDirection().multiplyScalar(5200);
      if (direction.y < 200) direction.y = Math.abs(direction.y) + 200;
      positions[i * 3] = direction.x;
      positions[i * 3 + 1] = direction.y;
      positions[i * 3 + 2] = direction.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    return new THREE.Points(geometry, material);
  }

  private buildBridge(): void {
    const bridgeGroup = new THREE.Group();
    this.scene.add(bridgeGroup);

    const towerMat = new THREE.MeshStandardMaterial({
      color: BRIDGE_COLOR,
      roughness: 0.7,
      metalness: 0.1,
    });
    const roadMat = new THREE.MeshStandardMaterial({
      color: ROAD_COLOR,
      roughness: 0.9,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: CABLE_COLOR,
      roughness: 0.5,
      metalness: 0.2,
    });

    const createTower = (x: number): THREE.Group => {
      const towerGroup = new THREE.Group();
      towerGroup.position.set(x, 0, 0);

      const legGeo = new THREE.BoxGeometry(TOWER_WIDTH, TOWER_HEIGHT, TOWER_DEPTH);
      const legLeft = new THREE.Mesh(legGeo, towerMat);
      legLeft.position.set(0, TOWER_HEIGHT / 2, 15);
      legLeft.castShadow = true;
      legLeft.receiveShadow = true;

      const legRight = new THREE.Mesh(legGeo, towerMat);
      legRight.position.set(0, TOWER_HEIGHT / 2, -15);
      legRight.castShadow = true;
      legRight.receiveShadow = true;

      const braceGeo = new THREE.BoxGeometry(TOWER_WIDTH - 2, 4, 30);
      const brace1 = new THREE.Mesh(braceGeo, towerMat);
      brace1.position.set(0, TOWER_HEIGHT * 0.9, 0);
      const brace2 = new THREE.Mesh(braceGeo, towerMat);
      brace2.position.set(0, TOWER_HEIGHT * 0.7, 0);
      const brace3 = new THREE.Mesh(braceGeo, towerMat);
      brace3.position.set(0, TOWER_HEIGHT * 0.5, 0);
      const brace4 = new THREE.Mesh(braceGeo, towerMat);
      brace4.position.set(0, DECK_Y + 5, 0);

      const topGeo = new THREE.BoxGeometry(TOWER_WIDTH - 2, 10, TOWER_DEPTH - 2);
      const topLeft = new THREE.Mesh(topGeo, towerMat);
      topLeft.position.set(0, TOWER_HEIGHT + 5, 15);
      const topRight = new THREE.Mesh(topGeo, towerMat);
      topRight.position.set(0, TOWER_HEIGHT + 5, -15);

      towerGroup.add(
        legLeft,
        legRight,
        brace1,
        brace2,
        brace3,
        brace4,
        topLeft,
        topRight,
      );
      return towerGroup;
    };

    bridgeGroup.add(createTower(-MAIN_SPAN / 2), createTower(MAIN_SPAN / 2));

    const deckGeo = new THREE.BoxGeometry(TOTAL_LENGTH, 2, DECK_WIDTH);
    const deck = new THREE.Mesh(deckGeo, roadMat);
    deck.position.set(0, DECK_Y, 0);
    deck.receiveShadow = true;
    bridgeGroup.add(deck);

    const createMainCable = (zOffset: number): THREE.Vector3[] => {
      const curve1 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-MAIN_SPAN / 2 - SIDE_SPAN, DECK_Y, zOffset),
        new THREE.Vector3(
          -MAIN_SPAN / 2 - SIDE_SPAN / 2,
          DECK_Y + (TOWER_HEIGHT - DECK_Y) / 2,
          zOffset,
        ),
        new THREE.Vector3(-MAIN_SPAN / 2, TOWER_HEIGHT, zOffset),
      );
      const curve2 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-MAIN_SPAN / 2, TOWER_HEIGHT, zOffset),
        new THREE.Vector3(0, DECK_Y + 5, zOffset),
        new THREE.Vector3(MAIN_SPAN / 2, TOWER_HEIGHT, zOffset),
      );
      const curve3 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(MAIN_SPAN / 2, TOWER_HEIGHT, zOffset),
        new THREE.Vector3(
          MAIN_SPAN / 2 + SIDE_SPAN / 2,
          DECK_Y + (TOWER_HEIGHT - DECK_Y) / 2,
          zOffset,
        ),
        new THREE.Vector3(MAIN_SPAN / 2 + SIDE_SPAN, DECK_Y, zOffset),
      );

      const points = [
        ...curve1.getPoints(20),
        ...curve2.getPoints(50),
        ...curve3.getPoints(20),
      ];
      const curvePath = new THREE.CatmullRomCurve3(points);
      const tubeGeo = new THREE.TubeGeometry(curvePath, 100, 1.5, 8, false);
      bridgeGroup.add(new THREE.Mesh(tubeGeo, cableMat));
      return points;
    };

    const leftCablePoints = createMainCable(15);
    const rightCablePoints = createMainCable(-15);

    const suspenderCount = leftCablePoints.length + rightCablePoints.length;
    const suspenderGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
    const suspenderMesh = new THREE.InstancedMesh(suspenderGeo, cableMat, suspenderCount);
    const dummy = new THREE.Object3D();
    let placed = 0;
    [leftCablePoints, rightCablePoints].forEach((points) => {
      points.forEach((p) => {
        if (p.y > DECK_Y + 2) {
          const height = p.y - DECK_Y;
          dummy.position.set(p.x, DECK_Y + height / 2, p.z);
          dummy.scale.set(1, height, 1);
          dummy.updateMatrix();
          suspenderMesh.setMatrixAt(placed++, dummy.matrix);
        }
      });
    });
    suspenderMesh.instanceMatrix.needsUpdate = true;
    suspenderMesh.count = placed;
    bridgeGroup.add(suspenderMesh);

    this.bridgeStats = { ...this.bridgeStats, suspenderCount: placed };
  }

  /* --------------------------- camera views ------------------------ */

  private buildViews(): CameraViewDef[] {
    // Closed loop running along both sides of the deck with U-turns at the ends.
    const deckPath = (): ((u: number) => CameraFrame) => {
      const y = 42;
      const controlPoints = [
        new THREE.Vector3(-360, y, 38),
        new THREE.Vector3(340, y, 38),
        new THREE.Vector3(425, y, 30),
        new THREE.Vector3(470, y, 0),
        new THREE.Vector3(425, y, -30),
        new THREE.Vector3(340, y, -38),
        new THREE.Vector3(-360, y, -38),
        new THREE.Vector3(-425, y, -30),
        new THREE.Vector3(-470, y, 0),
        new THREE.Vector3(-425, y, 30),
      ];
      const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.6);
      const position = new THREE.Vector3();
      const tangent = new THREE.Vector3();
      const lookAt = new THREE.Vector3();
      return (u: number): CameraFrame => {
        curve.getPointAt(u, position);
        curve.getTangentAt(u, tangent);
        lookAt.copy(position).addScaledVector(tangent, 160);
        lookAt.y = 30;
        return { position, lookAt };
      };
    };

    // Continuous orbit around the south tower.
    const towerOrbitPath = (): ((u: number) => CameraFrame) => {
      const centerX = -MAIN_SPAN / 2;
      const radius = 85;
      const position = new THREE.Vector3();
      const lookAt = new THREE.Vector3(centerX, 48, 0);
      return (u: number): CameraFrame => {
        const angle = u * Math.PI * 2;
        position.set(
          centerX + Math.cos(angle) * radius,
          62,
          Math.sin(angle) * radius,
        );
        return { position, lookAt };
      };
    };

    const defaultFrame: CameraFrame = {
      position: new THREE.Vector3(30, 30, 100),
      lookAt: new THREE.Vector3(0, 10, 0),
    };
    const aerialFrame: CameraFrame = {
      position: new THREE.Vector3(60, 600, 240),
      lookAt: new THREE.Vector3(0, 0, 0),
    };

    return [
      {
        id: 'default',
        label: '默认视角',
        kind: 'static',
        pathSpeed: 0,
        getFrame: () => defaultFrame,
      },
      {
        id: 'deck',
        label: '沿桥面飞行',
        kind: 'path',
        pathSpeed: 1 / 48,
        getFrame: deckPath(),
      },
      {
        id: 'towerOrbit',
        label: '环绕桥塔',
        kind: 'path',
        pathSpeed: 1 / 30,
        getFrame: towerOrbitPath(),
      },
      {
        id: 'aerial',
        label: '高空俯瞰',
        kind: 'static',
        pathSpeed: 0,
        getFrame: () => aerialFrame,
      },
    ];
  }

  private getViewDef(id: CameraViewId): CameraViewDef {
    const def = this.views.find((v) => v.id === id);
    if (!def) throw new Error(`Unknown camera view: ${id}`);
    return def;
  }

  /* ----------------------------- public API ------------------------ */

  getEnvironment(): EnvironmentParams {
    return { ...this.envParams };
  }

  /** Merge a patch of environment params; changes apply on the next frame. */
  updateEnvironment(patch: Partial<EnvironmentParams>): void {
    this.envParams = {
      sunElevation: patch.sunElevation ?? this.envParams.sunElevation,
      sunAzimuth: patch.sunAzimuth ?? this.envParams.sunAzimuth,
      dayNight: patch.dayNight ?? this.envParams.dayNight,
      fogDensity: patch.fogDensity ?? this.envParams.fogDensity,
      waveStrength: patch.waveStrength ?? this.envParams.waveStrength,
      exposure: patch.exposure ?? this.envParams.exposure,
    };
    this.envDirty = true;
  }

  /** Apply a day / dusk / night preset (keeps azimuth, fog, waves, exposure). */
  applyTimeOfDay(preset: TimeOfDayPreset): EnvironmentParams {
    if (preset === 'night') {
      this.updateEnvironment({ sunElevation: -18, dayNight: 0 });
    } else if (preset === 'dusk') {
      this.updateEnvironment({
        sunElevation: DEFAULT_ENVIRONMENT.sunElevation,
        dayNight: DEFAULT_ENVIRONMENT.dayNight,
      });
    } else {
      this.updateEnvironment({ sunElevation: 60, dayNight: 1 });
    }
    return this.getEnvironment();
  }

  getCameraViews(): CameraViewInfo[] {
    return this.views.map((v) => ({ id: v.id, label: v.label }));
  }

  /** Smoothly fly to a preset view; path views keep animating after arrival. */
  flyToView(id: CameraViewId): void {
    const def = this.getViewDef(id);
    const end = def.getFrame(0);
    this.tween = {
      elapsed: 0,
      duration: TWEEN_DURATION,
      startPos: this.camera.position.clone(),
      startLook: this.controls.target.clone(),
      endPos: end.position.clone(),
      endLook: end.lookAt.clone(),
      nextKind: def.kind,
    };
    this.cameraMode = 'tween';
    this.activeView = id;
    this.pathU = 0;
    this.controls.enabled = false;
  }

  /** Stop any auto camera motion and hand control back to OrbitControls. */
  cancelCameraMotion(): void {
    this.cameraMode = 'free';
    this.activeView = null;
    this.tween = null;
    this.controls.enabled = true;
    this.controls.update();
  }

  getBridgeStats(): BridgeStats {
    return { ...this.bridgeStats };
  }

  getLiveStats(): LiveStats {
    return {
      fps: this.fps,
      cameraX: this.camera.position.x,
      cameraY: this.camera.position.y,
      cameraZ: this.camera.position.z,
      viewId: this.activeView ?? 'free',
    };
  }

  /** Render the current frame and return it as a PNG data URL. */
  captureImage(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.onUserInteract);
    this.controls.dispose();
    if (this.renderTarget) this.renderTarget.dispose();
    this.pmremGenerator.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const material = obj.material;
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose());
        } else {
          material.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  /* --------------------------- internal loop ----------------------- */

  private readonly onWindowResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private readonly onUserInteract = (): void => {
    if (this.cameraMode !== 'free') this.cancelCameraMotion();
  };

  private updateSun(): void {
    const phi = THREE.MathUtils.degToRad(90 - this.envParams.sunElevation);
    const theta = THREE.MathUtils.degToRad(this.envParams.sunAzimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    (this.sky.material as THREE.ShaderMaterial).uniforms['sunPosition']!.value.copy(
      this.sun,
    );
  }

  private applyEnvironment(): void {
    const t = THREE.MathUtils.clamp(this.envParams.dayNight, 0, 1);
    const keyframe =
      t <= 0.5
        ? lerpKeyframe(
            ATMOSPHERE_NIGHT,
            ATMOSPHERE_DUSK,
            t / 0.5,
            this.tmpKeyframe,
            this.tmpColorA,
            this.tmpColorB,
          )
        : lerpKeyframe(
            ATMOSPHERE_DUSK,
            ATMOSPHERE_DAY,
            (t - 0.5) / 0.5,
            this.tmpKeyframe,
            this.tmpColorA,
            this.tmpColorB,
          );

    this.updateSun();

    const skyUniforms = (this.sky.material as THREE.ShaderMaterial).uniforms;
    skyUniforms['turbidity']!.value = keyframe.turbidity;
    skyUniforms['rayleigh']!.value = keyframe.rayleigh;

    this.ambientLight.color.setHex(keyframe.ambientColor);
    this.ambientLight.intensity = keyframe.ambientIntensity;
    this.dirLight.color.setHex(keyframe.dirColor);
    this.dirLight.intensity = keyframe.dirIntensity;

    this.fog.color.setHex(keyframe.fogColor);
    this.fog.density = this.envParams.fogDensity;

    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms;
    (waterUniforms['waterColor']!.value as THREE.Color).setHex(keyframe.waterColor);
    waterUniforms['distortionScale']!.value = this.envParams.waveStrength;

    (this.stars.material as THREE.PointsMaterial).opacity = keyframe.starsOpacity;

    this.renderer.toneMappingExposure = this.envParams.exposure;

    this.refreshEnvironmentMap();
  }

  private refreshEnvironmentMap(): void {
    this.sceneEnv.add(this.sky);
    const target = this.pmremGenerator.fromScene(this.sceneEnv);
    this.scene.add(this.sky);
    if (this.renderTarget) this.renderTarget.dispose();
    this.renderTarget = target;
    this.scene.environment = target.texture;
  }

  private updateCameraMotion(delta: number): void {
    if (this.cameraMode === 'tween' && this.tween) {
      const tween = this.tween;
      tween.elapsed += delta;
      const t = Math.min(tween.elapsed / tween.duration, 1);
      const e = easeInOutCubic(t);
      this.camera.position.lerpVectors(tween.startPos, tween.endPos, e);
      this.controls.target.lerpVectors(tween.startLook, tween.endLook, e);
      this.camera.lookAt(this.controls.target);

      if (t >= 1) {
        if (tween.nextKind === 'path') {
          this.cameraMode = 'path';
          this.pathU = 0;
        } else {
          this.cameraMode = 'free';
          this.controls.enabled = true;
          this.controls.update();
        }
        this.tween = null;
      }
      return;
    }

    if (this.cameraMode === 'path' && this.activeView) {
      const def = this.getViewDef(this.activeView);
      this.pathU = (this.pathU + delta * def.pathSpeed) % 1;
      const frame = def.getFrame(this.pathU);
      this.camera.position.copy(frame.position);
      this.camera.lookAt(frame.lookAt);
      return;
    }

    this.controls.update();
  }

  private readonly animate = (): void => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.05);

    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms;
    waterUniforms['time']!.value += delta;

    if (this.envDirty) {
      this.applyEnvironment();
      this.envDirty = false;
    }

    this.updateCameraMotion(delta);
    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    this.fpsElapsed += delta;
    if (this.fpsElapsed >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsElapsed);
      this.frameCount = 0;
      this.fpsElapsed = 0;
    }
  };
}
