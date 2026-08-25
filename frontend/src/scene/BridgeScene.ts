import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import {
  DEFAULT_ENV_STATE,
  type BridgeParams,
  type CameraViewName,
  type EnvState,
  type RuntimeStats,
} from './types';

const BRIDGE_COLOR = 0xf04a00;
const ROAD_COLOR = 0x333333;
const CABLE_COLOR = 0xf04a00;

const BRIDGE_PARAMS: BridgeParams = {
  towerHeight: 100,
  towerWidth: 10,
  towerDepth: 6,
  mainSpan: 400,
  sideSpan: 150,
  deckY: 25,
  deckWidth: 34,
  deckThickness: 2,
  towerCount: 2,
  mainCableCount: 2,
  suspenderDiameter: 0.6,
  totalLength: 400 + 150 * 2,
};

interface FlightState {
  active: boolean;
  startTime: number;
  duration: number;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  onComplete?: () => void;
}

interface OrbitState {
  active: boolean;
  center: THREE.Vector3;
  radius: number;
  height: number;
  angle: number;
  speed: number;
}

export class BridgeScene {
  private container: HTMLElement | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private water!: Water;
  private sky!: Sky;
  private sun!: THREE.Vector3;
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;
  private fog!: THREE.FogExp2;
  private pmremGenerator!: THREE.PMREMGenerator;
  private renderTarget!: THREE.WebGLRenderTarget;
  private sceneEnv!: THREE.Scene;

  private readonly clock = new THREE.Clock();
  private animationId = 0;
  private disposed = false;

  private readonly flightState: FlightState = {
    active: false,
    startTime: 0,
    duration: 0,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
  };

  private readonly orbitState: OrbitState = {
    active: false,
    center: new THREE.Vector3(),
    radius: 80,
    height: 60,
    angle: 0,
    speed: 0.3,
  };

  private readonly env: EnvState = { ...DEFAULT_ENV_STATE };

  private statsCallback: ((stats: RuntimeStats) => void) | null = null;
  private interruptCallback: (() => void) | null = null;

  private frameCount = 0;
  private lastFpsTime = performance.now();
  private lastStatsTime = 0;
  private currentFps = 0;

  mount(container: HTMLElement): void {
    if (this.container) return;
    this.container = container;
    this.init();
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.renderer?.domElement.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('resize', this.onResize);
    this.renderTarget?.dispose();
    this.pmremGenerator?.dispose();
    this.controls?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.container?.contains(this.renderer.domElement)) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
    this.statsCallback = null;
    this.interruptCallback = null;
    this.container = null;
  }

  setEnv(patch: Partial<EnvState>): void {
    const changed: Partial<EnvState> = {};
    (Object.keys(patch) as (keyof EnvState)[]).forEach((key) => {
      const value = patch[key];
      if (value !== undefined && value !== this.env[key]) {
        (this.env[key] as number) = value;
        changed[key] = value;
      }
    });
    if (Object.keys(changed).length === 0) return;

    if (changed.dayNight !== undefined) {
      this.applyDayNight();
    } else if (changed.sunElevationDeg !== undefined || changed.sunAzimuthDeg !== undefined) {
      this.updateSun();
    }

    if (changed.fogDensity !== undefined && this.fog) {
      this.fog.density = this.env.fogDensity;
    }
    if (changed.waterDistortion !== undefined && this.water) {
      (this.water.material as THREE.ShaderMaterial).uniforms['distortionScale']!.value =
        this.env.waterDistortion;
    }
    if (changed.exposure !== undefined && this.renderer) {
      this.renderer.toneMappingExposure = this.env.exposure;
    }
  }

  getEnv(): EnvState {
    return { ...this.env };
  }

  getBridgeParams(): BridgeParams {
    return BRIDGE_PARAMS;
  }

  onStatsUpdate(cb: (stats: RuntimeStats) => void): void {
    this.statsCallback = cb;
  }

  onViewInterrupt(cb: () => void): void {
    this.interruptCallback = cb;
  }

  flyToView(name: CameraViewName): void {
    switch (name) {
      case 'deck':
        this.flyTo(
          new THREE.Vector3(
            -BRIDGE_PARAMS.totalLength / 2 - 20,
            BRIDGE_PARAMS.deckY + 5,
            0
          ),
          new THREE.Vector3(BRIDGE_PARAMS.totalLength / 2, BRIDGE_PARAMS.deckY, 0),
          2000
        );
        break;
      case 'tower':
        this.startTowerOrbit();
        break;
      case 'overhead':
        this.flyTo(
          new THREE.Vector3(0, 600, 0.01),
          new THREE.Vector3(0, 0, 0),
          2200
        );
        break;
      case 'default':
        this.flyTo(
          new THREE.Vector3(30, 30, 100),
          new THREE.Vector3(0, 10, 0),
          1800
        );
        break;
    }
  }

  stopCameraAnimation(): void {
    this.flightState.active = false;
    this.orbitState.active = false;
    if (this.controls) this.controls.enabled = true;
  }

  exportImage(filename?: string): boolean {
    if (!this.renderer || !this.scene || !this.camera) return false;
    this.renderer.render(this.scene, this.camera);
    const dataURL = this.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename ?? `golden-gate-bridge-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
    return true;
  }

  private init(): void {
    if (!this.container) return;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      1,
      20000
    );
    this.camera.position.set(30, 30, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.env.exposure;
    this.container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown, true);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(0, 10, 0);
    this.controls.minDistance = 40.0;
    this.controls.maxDistance = 2000.0;
    this.controls.update();

    this.sun = new THREE.Vector3();
    this.sky = new Sky();
    this.sky.scale.setScalar(10000);
    this.scene.add(this.sky);

    const skyUniforms = (this.sky.material as THREE.ShaderMaterial).uniforms;
    skyUniforms['turbidity']!.value = 10;
    skyUniforms['rayleigh']!.value = 2;
    skyUniforms['mieCoefficient']!.value = 0.005;
    skyUniforms['mieDirectionalG']!.value = 0.8;

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.sceneEnv = new THREE.Scene();

    this.updateSun();

    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    this.water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: createWaterNormals(),
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: this.env.waterDistortion,
      fog: false,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    this.ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffaa33, 1);
    this.dirLight.position.set(-1, 1, 1);
    this.scene.add(this.dirLight);

    this.fog = new THREE.FogExp2(0xefd1b5, this.env.fogDensity);
    this.scene.fog = this.fog;

    this.buildBridge();

    window.addEventListener('resize', this.onResize);

    this.animate();
  }

  private onResize = (): void => {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onPointerDown = (): void => {
    if (this.flightState.active || this.orbitState.active) {
      this.stopCameraAnimation();
      this.interruptCallback?.();
    }
  };

  private updateSun(): void {
    const theta = (this.env.sunElevationDeg * Math.PI) / 180;
    const phi = (this.env.sunAzimuthDeg / 360 - 0.5) * Math.PI * 2;

    this.sun.x = Math.cos(phi);
    this.sun.y = Math.sin(phi) * Math.sin(theta);
    this.sun.z = Math.sin(phi) * Math.cos(theta);

    (this.sky.material as THREE.ShaderMaterial).uniforms['sunPosition']!.value.copy(this.sun);

    if (this.renderTarget) this.renderTarget.dispose();
    this.sceneEnv.add(this.sky);
    this.renderTarget = this.pmremGenerator.fromScene(this.sceneEnv);
    this.scene.add(this.sky);
    this.scene.environment = this.renderTarget.texture;
  }

  private applyDayNight(): void {
    const t = this.env.dayNight;

    this.ambientLight.intensity = 0.05 + t * 0.35;
    this.dirLight.intensity = 0.1 + t * 0.9;

    const dayColor = new THREE.Color(0xffaa33);
    const nightColor = new THREE.Color(0x4466aa);
    this.dirLight.color.copy(nightColor).lerp(dayColor, t);

    const dayAmbient = new THREE.Color(0xcccccc);
    const nightAmbient = new THREE.Color(0x1a1a3a);
    this.ambientLight.color.copy(nightAmbient).lerp(dayAmbient, t);

    const skyUniforms = (this.sky.material as THREE.ShaderMaterial).uniforms;
    skyUniforms['turbidity']!.value = 1 + t * 9;
    skyUniforms['rayleigh']!.value = 0.1 + t * 1.9;
    skyUniforms['mieCoefficient']!.value = 0.001 + t * 0.004;
    skyUniforms['mieDirectionalG']!.value = 0.5 + t * 0.3;

    const dayFog = new THREE.Color(0xefd1b5);
    const nightFog = new THREE.Color(0x0a0e1f);
    this.fog.color.copy(nightFog).lerp(dayFog, t);

    this.updateSun();
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

    const { towerHeight, towerWidth, towerDepth, mainSpan, sideSpan, deckY } = BRIDGE_PARAMS;

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
        topRight
      );
      return towerGroup;
    };

    bridgeGroup.add(createTower(-mainSpan / 2), createTower(mainSpan / 2));

    const deckGeo = new THREE.BoxGeometry(
      BRIDGE_PARAMS.totalLength,
      BRIDGE_PARAMS.deckThickness,
      BRIDGE_PARAMS.deckWidth
    );
    const deck = new THREE.Mesh(deckGeo, roadMat);
    deck.position.set(0, deckY, 0);
    deck.receiveShadow = true;
    bridgeGroup.add(deck);

    const createMainCable = (zOffset: number): THREE.Vector3[] => {
      const curve1 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-mainSpan / 2 - sideSpan, deckY, zOffset),
        new THREE.Vector3(
          -mainSpan / 2 - sideSpan / 2,
          deckY + (towerHeight - deckY) / 2,
          zOffset
        ),
        new THREE.Vector3(-mainSpan / 2, towerHeight, zOffset)
      );
      const curve2 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-mainSpan / 2, towerHeight, zOffset),
        new THREE.Vector3(0, deckY + 5, zOffset),
        new THREE.Vector3(mainSpan / 2, towerHeight, zOffset)
      );
      const curve3 = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(mainSpan / 2, towerHeight, zOffset),
        new THREE.Vector3(
          mainSpan / 2 + sideSpan / 2,
          deckY + (towerHeight - deckY) / 2,
          zOffset
        ),
        new THREE.Vector3(mainSpan / 2 + sideSpan, deckY, zOffset)
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
    bridgeGroup.add(suspenderMesh);
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private flyTo(
    endPos: THREE.Vector3,
    endTarget: THREE.Vector3,
    duration: number,
    onComplete?: () => void
  ): void {
    this.flightState.active = true;
    this.orbitState.active = false;
    this.flightState.startTime = performance.now();
    this.flightState.duration = duration;
    this.flightState.startPos.copy(this.camera.position);
    this.flightState.endPos.copy(endPos);
    this.flightState.startTarget.copy(this.controls.target);
    this.flightState.endTarget.copy(endTarget);
    this.flightState.onComplete = onComplete;
    this.controls.enabled = false;
  }

  private startTowerOrbit(): void {
    const towerX = -BRIDGE_PARAMS.mainSpan / 2;
    this.orbitState.center.set(towerX, BRIDGE_PARAMS.deckY + 20, 0);
    this.orbitState.radius = 90;
    this.orbitState.height = BRIDGE_PARAMS.deckY + 35;
    this.orbitState.angle = Math.atan2(
      this.camera.position.z,
      this.camera.position.x - towerX
    );
    this.orbitState.speed = 0.35;

    const entryAngle = this.orbitState.angle;
    const flyEndPos = new THREE.Vector3(
      towerX + Math.cos(entryAngle) * this.orbitState.radius,
      this.orbitState.height,
      Math.sin(entryAngle) * this.orbitState.radius
    );

    this.flyTo(flyEndPos, this.orbitState.center.clone(), 1500, () => {
      this.orbitState.active = true;
      this.orbitState.angle = entryAngle;
    });
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = this.clock.getDelta();

    if (this.water) {
      (this.water.material as THREE.ShaderMaterial).uniforms['time']!.value += delta;
    }

    if (this.flightState.active) {
      const elapsed = now - this.flightState.startTime;
      const raw = Math.min(elapsed / this.flightState.duration, 1);
      const t = this.easeInOutCubic(raw);

      this.camera.position.lerpVectors(
        this.flightState.startPos,
        this.flightState.endPos,
        t
      );
      this.controls.target.lerpVectors(
        this.flightState.startTarget,
        this.flightState.endTarget,
        t
      );

      if (raw >= 1) {
        this.flightState.active = false;
        const cb = this.flightState.onComplete;
        this.flightState.onComplete = undefined;
        if (cb) cb();
        if (!this.orbitState.active) {
          this.controls.enabled = true;
        }
      }
    } else if (this.orbitState.active) {
      this.orbitState.angle += this.orbitState.speed * delta;
      this.camera.position.set(
        this.orbitState.center.x +
          Math.cos(this.orbitState.angle) * this.orbitState.radius,
        this.orbitState.height,
        this.orbitState.center.z +
          Math.sin(this.orbitState.angle) * this.orbitState.radius
      );
      this.controls.target.copy(this.orbitState.center);
    } else {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    if (now - this.lastFpsTime >= 500) {
      this.currentFps = Math.round(
        (this.frameCount * 1000) / (now - this.lastFpsTime)
      );
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    if (this.statsCallback && now - this.lastStatsTime >= 100) {
      this.lastStatsTime = now;
      this.statsCallback({
        cameraX: this.camera.position.x,
        cameraY: this.camera.position.y,
        cameraZ: this.camera.position.z,
        targetX: this.controls.target.x,
        targetY: this.controls.target.y,
        targetZ: this.controls.target.z,
        fps: this.currentFps,
      });
    }
  };
}

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
