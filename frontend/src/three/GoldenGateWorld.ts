import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import {
  BRIDGE_PARAMS,
  CAMERA_MOTION,
  CAMERA_POSES,
  COLORS,
  DEFAULT_ENVIRONMENT,
} from './bridgeConfig';
import type {
  CameraReadout,
  CameraViewId,
  DayNightPreset,
  EnvironmentSettings,
} from './types';

/** Callback fired (throttled) with the live camera / sun readout. */
type ReadoutHandler = (readout: CameraReadout) => void;

const CAMERA_FLIGHT_DURATION = 1.6; // seconds
const READOUT_INTERVAL = 0.1; // seconds between UI readout pushes

/** Views whose fly-in hands off to a sustained procedural motion. */
type AnimatedViewId = 'alongDeck' | 'aroundTower';

function isAnimatedView(view: CameraViewId): view is AnimatedViewId {
  return view === 'alongDeck' || view === 'aroundTower';
}

/** Smootherstep easing for pleasant camera flights. */
function easeInOut(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

interface CameraFlight {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  elapsed: number;
  duration: number;
  view: CameraViewId;
}

/**
 * Encapsulates the entire Golden Gate 3D world: scene graph, renderer,
 * environment, bridge geometry, cinematic camera flights and image export.
 *
 * All Three.js / stateful logic lives here; Vue components only read the
 * exposed readout and invoke intent methods.
 */
export class GoldenGateWorld {
  private readonly container: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly water: Water;
  private readonly sky: Sky;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;

  private readonly pmremGenerator: THREE.PMREMGenerator;
  private readonly envScene: THREE.Scene;
  private renderTarget: THREE.WebGLRenderTarget | null = null;

  private readonly sun = new THREE.Vector3();
  private readonly settings: EnvironmentSettings = { ...DEFAULT_ENVIRONMENT };
  private lastSunElevation = Number.NaN;
  private lastSunAzimuth = Number.NaN;

  private activeView: CameraViewId = 'free';
  private flight: CameraFlight | null = null;
  /** Non-null while a sustained cinematic motion is playing. */
  private motion: AnimatedViewId | null = null;
  /** Seconds elapsed within the current sustained motion. */
  private motionTime = 0;

  // Scratch vectors reused every frame to avoid per-frame allocation.
  private readonly scratchPos = new THREE.Vector3();
  private readonly scratchTarget = new THREE.Vector3();

  private animationId = 0;
  private readonly clock = new THREE.Clock();
  private readoutAccumulator = 0;
  private onReadout: ReadoutHandler | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene
    this.scene = new THREE.Scene();

    // 2. Camera (matches original starting pose)
    const start = CAMERA_POSES.free;
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      1,
      20000,
    );
    this.camera.position.set(...start.position);

    // 3. Renderer. `preserveDrawingBuffer` lets us export the canvas to an
    // image without altering the rendered result.
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.settings.exposure;
    container.appendChild(this.renderer.domElement);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(...start.target);
    this.controls.minDistance = 40.0;
    this.controls.maxDistance = 2000.0;
    // A manual drag cancels any active cinematic flight and returns to free.
    this.controls.addEventListener('start', () => this.onManualControl());
    this.controls.update();

    // 5. Sky
    this.sky = new Sky();
    this.sky.scale.setScalar(10000);
    this.scene.add(this.sky);
    const skyUniforms = (this.sky.material as THREE.ShaderMaterial).uniforms;
    skyUniforms['turbidity']!.value = 10;
    skyUniforms['rayleigh']!.value = 2;
    skyUniforms['mieCoefficient']!.value = 0.005;
    skyUniforms['mieDirectionalG']!.value = 0.8;

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envScene = new THREE.Scene();

    // 6. Water
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    this.water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: this.createWaterNormals(),
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: this.settings.waterDistortion,
      fog: this.scene.fog !== undefined,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    // 7. Lighting
    this.ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
    this.scene.add(this.ambientLight);
    this.dirLight = new THREE.DirectionalLight(0xffaa33, 1);
    this.dirLight.position.set(-1, 1, 1);
    this.scene.add(this.dirLight);

    // Fog
    this.fog = new THREE.FogExp2(0xefd1b5, this.settings.fogDensity);
    this.scene.fog = this.fog;

    // 8. Bridge
    this.buildBridge();

    // Apply the (default) environment so the sun / env map is populated
    // exactly as the original `updateSun()` did on load.
    this.applySun();

    window.addEventListener('resize', this.onWindowResize);
    this.animate();
  }

  // ---- Public API -----------------------------------------------------

  /** Subscribe to live camera / sun readouts. */
  setReadoutHandler(handler: ReadoutHandler): void {
    this.onReadout = handler;
  }

  /** Current environment settings (copy). */
  getSettings(): EnvironmentSettings {
    return { ...this.settings };
  }

  /** Static bridge parameters for display. */
  getBridgeParams() {
    return BRIDGE_PARAMS;
  }

  /**
   * Apply live environment settings. Cheap uniforms update every call; the
   * expensive sky/env-map regeneration only runs when the sun actually moves.
   */
  updateEnvironment(patch: Partial<EnvironmentSettings>): void {
    Object.assign(this.settings, patch);

    this.renderer.toneMappingExposure = this.settings.exposure;
    this.fog.density = this.settings.fogDensity;
    (this.water.material as THREE.ShaderMaterial).uniforms[
      'distortionScale'
    ]!.value = this.settings.waterDistortion;

    if (
      this.settings.sunElevation !== this.lastSunElevation ||
      this.settings.sunAzimuth !== this.lastSunAzimuth
    ) {
      this.applySun();
    }
  }

  /**
   * Apply a day / night preset by nudging the sun and light tint, then
   * re-applying. Returns the resulting settings so the UI can sync sliders.
   */
  applyPreset(preset: DayNightPreset): EnvironmentSettings {
    if (preset === 'day') {
      this.dirLight.color.set(0xffffff);
      this.dirLight.intensity = 1;
      this.ambientLight.intensity = 0.5;
      this.updateEnvironment({ sunElevation: 0.6, exposure: 0.5 });
    } else {
      this.dirLight.color.set(0x223355);
      this.dirLight.intensity = 0.15;
      this.ambientLight.intensity = 0.12;
      this.updateEnvironment({ sunElevation: 0.495, exposure: 0.25 });
    }
    return this.getSettings();
  }

  /**
   * Trigger a named cinematic view.
   *
   * - `free` / `aerial`: fly to a fixed pose and stop, then hand back to
   *   manual orbit.
   * - `alongDeck` / `aroundTower`: fly to the motion's phase-0 pose, then run
   *   a sustained procedural animation until the user drags or picks another
   *   view.
   *
   * A manual drag at any time (OrbitControls `start` event) interrupts both
   * the flight and the sustained motion and returns to free orbit.
   */
  flyTo(view: CameraViewId): void {
    // Compute the destination pose. For animated views this is the motion's
    // starting pose so the hand-off is seamless (no jump).
    const toPos = new THREE.Vector3();
    const toTarget = new THREE.Vector3();
    if (isAnimatedView(view)) {
      this.evalMotion(view, 0, toPos, toTarget);
    } else {
      const pose = CAMERA_POSES[view];
      toPos.set(...pose.position);
      toTarget.set(...pose.target);
    }

    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
      elapsed: 0,
      duration: CAMERA_FLIGHT_DURATION,
      view,
    };
    this.motion = null;
    this.motionTime = 0;
    // Controls stay enabled so a drag can interrupt; we simply ignore their
    // effect while the flight/motion drives the camera each frame.
    this.activeView = view;
  }

  /** Render one frame and return the canvas as a PNG data URL. */
  captureImage(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** Dispose of all GPU resources and listeners. */
  dispose(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onWindowResize);
    this.controls.dispose();
    this.renderTarget?.dispose();
    this.pmremGenerator.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // ---- Internals ------------------------------------------------------

  private onManualControl(): void {
    this.flight = null;
    this.motion = null;
    this.motionTime = 0;
    this.controls.enabled = true;
    this.activeView = 'free';
  }

  private applySun(): void {
    const theta = Math.PI * (this.settings.sunElevation - 0.5);
    const phi = 2 * Math.PI * (this.settings.sunAzimuth - 0.5);

    this.sun.x = Math.cos(phi);
    this.sun.y = Math.sin(phi) * Math.sin(theta);
    this.sun.z = Math.sin(phi) * Math.cos(theta);

    (this.sky.material as THREE.ShaderMaterial).uniforms['sunPosition']!.value.copy(
      this.sun,
    );

    if (this.renderTarget) this.renderTarget.dispose();
    this.envScene.add(this.sky);
    this.renderTarget = this.pmremGenerator.fromScene(this.envScene);
    this.scene.add(this.sky);
    this.scene.environment = this.renderTarget.texture;

    this.lastSunElevation = this.settings.sunElevation;
    this.lastSunAzimuth = this.settings.sunAzimuth;
  }

  private createWaterNormals(): THREE.Texture {
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

  private buildBridge(): void {
    const {
      towerHeight,
      towerWidth,
      towerDepth,
      span,
      sideSpan,
      deckHeight: deckY,
      deckWidth,
      totalLength,
    } = BRIDGE_PARAMS;

    const bridgeGroup = new THREE.Group();
    this.scene.add(bridgeGroup);

    const towerMat = new THREE.MeshStandardMaterial({
      color: COLORS.bridge,
      roughness: 0.7,
      metalness: 0.1,
    });
    const roadMat = new THREE.MeshStandardMaterial({
      color: COLORS.road,
      roughness: 0.9,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: COLORS.cable,
      roughness: 0.5,
      metalness: 0.2,
    });

    const createTower = (x: number): THREE.Group => {
      const towerGroup = new THREE.Group();
      towerGroup.position.set(x, 0, 0);

      const legGeo = new THREE.BoxGeometry(towerWidth, towerHeight, towerDepth);
      const legLeft = new THREE.Mesh(legGeo, towerMat);
      legLeft.position.set(0, towerHeight / 2, 15);
      legLeft.castShadow = true;
      legLeft.receiveShadow = true;

      const legRight = new THREE.Mesh(legGeo, towerMat);
      legRight.position.set(0, towerHeight / 2, -15);
      legRight.castShadow = true;
      legRight.receiveShadow = true;

      const braceGeo = new THREE.BoxGeometry(towerWidth - 2, 4, 30);
      const brace1 = new THREE.Mesh(braceGeo, towerMat);
      brace1.position.set(0, towerHeight * 0.9, 0);
      const brace2 = new THREE.Mesh(braceGeo, towerMat);
      brace2.position.set(0, towerHeight * 0.7, 0);
      const brace3 = new THREE.Mesh(braceGeo, towerMat);
      brace3.position.set(0, towerHeight * 0.5, 0);
      const brace4 = new THREE.Mesh(braceGeo, towerMat);
      brace4.position.set(0, deckY + 5, 0);

      const topGeo = new THREE.BoxGeometry(towerWidth - 2, 10, towerDepth - 2);
      const topLeft = new THREE.Mesh(topGeo, towerMat);
      topLeft.position.set(0, towerHeight + 5, 15);
      const topRight = new THREE.Mesh(topGeo, towerMat);
      topRight.position.set(0, towerHeight + 5, -15);

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

    bridgeGroup.add(createTower(-span / 2), createTower(span / 2));

    const deckGeo = new THREE.BoxGeometry(totalLength, 2, deckWidth);
    const deck = new THREE.Mesh(deckGeo, roadMat);
    deck.position.set(0, deckY, 0);
    deck.receiveShadow = true;
    bridgeGroup.add(deck);

    const createMainCable = (zOffset: number): THREE.Vector3[] => {
      const curve1 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-span / 2 - sideSpan, deckY, zOffset),
        new THREE.Vector3(
          -span / 2 - sideSpan / 2,
          deckY + (towerHeight - deckY) / 2,
          zOffset,
        ),
        new THREE.Vector3(-span / 2, towerHeight, zOffset),
      );
      const curve2 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-span / 2, towerHeight, zOffset),
        new THREE.Vector3(0, deckY + 5, zOffset),
        new THREE.Vector3(span / 2, towerHeight, zOffset),
      );
      const curve3 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(span / 2, towerHeight, zOffset),
        new THREE.Vector3(
          span / 2 + sideSpan / 2,
          deckY + (towerHeight - deckY) / 2,
          zOffset,
        ),
        new THREE.Vector3(span / 2 + sideSpan, deckY, zOffset),
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
    const suspenderMesh = new THREE.InstancedMesh(
      suspenderGeo,
      cableMat,
      suspenderCount,
    );

    const dummy = new THREE.Object3D();
    let idx = 0;
    [leftCablePoints, rightCablePoints].forEach((points) => {
      points.forEach((p) => {
        if (p.y > deckY + 2) {
          const height = p.y - deckY;
          dummy.position.set(p.x, deckY + height / 2, p.z);
          dummy.scale.set(1, height, 1);
          dummy.updateMatrix();
          suspenderMesh.setMatrixAt(idx++, dummy.matrix);
        }
      });
    });
    suspenderMesh.count = idx;
    bridgeGroup.add(suspenderMesh);
  }

  private readonly onWindowResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private updateFlight(delta: number): void {
    if (!this.flight) return;
    this.flight.elapsed += delta;
    const t = Math.min(this.flight.elapsed / this.flight.duration, 1);
    const k = easeInOut(t);

    this.camera.position.lerpVectors(this.flight.fromPos, this.flight.toPos, k);
    this.controls.target.lerpVectors(
      this.flight.fromTarget,
      this.flight.toTarget,
      k,
    );

    if (t >= 1) {
      const { view } = this.flight;
      this.flight = null;
      if (isAnimatedView(view)) {
        // Hand off to the sustained motion, starting exactly where the flight
        // ended (phase 0), so there is no positional jump.
        this.motion = view;
        this.motionTime = 0;
      }
      // For `free` / `aerial` we simply stop and let manual orbit resume.
    }
  }

  /** Advance and apply the active sustained cinematic motion. */
  private updateMotion(delta: number): void {
    if (!this.motion) return;
    this.motionTime += delta;
    this.evalMotion(
      this.motion,
      this.motionTime,
      this.scratchPos,
      this.scratchTarget,
    );
    this.camera.position.copy(this.scratchPos);
    this.controls.target.copy(this.scratchTarget);
  }

  /**
   * Pure evaluation of an animated view at a given time, writing the camera
   * position and look-at target into the supplied vectors. Used both for the
   * live motion and to derive the flight's entry pose at `time = 0`.
   */
  private evalMotion(
    view: AnimatedViewId,
    time: number,
    outPos: THREE.Vector3,
    outTarget: THREE.Vector3,
  ): void {
    if (view === 'aroundTower') {
      const m = CAMERA_MOTION.aroundTower;
      const a = time * m.angularSpeed;
      outPos.set(
        m.towerX + Math.cos(a) * m.radius,
        m.height,
        Math.sin(a) * m.radius,
      );
      outTarget.set(m.towerX, m.targetHeight, 0);
    } else {
      const m = CAMERA_MOTION.alongDeck;
      // Sine sweep back and forth along the deck (X axis). The look-at point
      // is the same path advanced by `lead` seconds, so it naturally sits
      // ahead of the camera in whichever direction it is currently travelling.
      const x = Math.sin(time * m.speed) * m.amplitude;
      const leadX = Math.sin((time + m.lead) * m.speed) * m.amplitude;
      outPos.set(x, m.height, m.zOffset);
      outTarget.set(leadX, m.targetHeight, 0);
    }
  }

  private pushReadout(delta: number): void {
    if (!this.onReadout) return;
    this.readoutAccumulator += delta;
    if (this.readoutAccumulator < READOUT_INTERVAL) return;
    this.readoutAccumulator = 0;

    const pos = this.camera.position;
    this.onReadout({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      distance: pos.distanceTo(this.controls.target),
      sunAltitudeDeg: THREE.MathUtils.radToDeg(Math.asin(this.sun.y)),
      view: this.activeView,
    });
  }

  private readonly animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();

    (this.water.material as THREE.ShaderMaterial).uniforms['time']!.value +=
      1.0 / 60.0;

    this.updateFlight(delta);
    this.updateMotion(delta);
    this.controls.update();
    this.pushReadout(delta);
    this.renderer.render(this.scene, this.camera);
  };
}
