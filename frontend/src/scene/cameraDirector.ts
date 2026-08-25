import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraMode } from './sceneState';

/** 某一时刻相机的位置与观察目标 */
interface FlightSample {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** 桥面高度（与场景构建一致） */
const DECK_Y = 25;
/** 桥塔 X 坐标（主跨 400 的一半） */
const TOWER_X = 200;
/** 模式切换过渡时长（秒） */
const TRANSITION_SECONDS = 2.2;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * 相机飞行控制器。
 * 在自由视角（OrbitControls）与预设飞行航线之间切换，
 * 切换时以缓动插值平滑过渡，飞行中接管相机。
 */
export class CameraDirector {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private mode: CameraMode = 'free';
  private elapsed = 0;
  private transitionElapsed = 0;
  private transitioning = false;
  private readonly fromPosition = new THREE.Vector3();
  private readonly fromTarget = new THREE.Vector3();
  private readonly lastTarget = new THREE.Vector3(0, 10, 0);

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
  }

  /** 当前是否处于自由视角（由 OrbitControls 控制） */
  get isFreeMode(): boolean {
    return this.mode === 'free';
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    // 以当前实际位置作为过渡起点
    this.fromPosition.copy(this.camera.position);
    this.fromTarget.copy(this.mode === 'free' ? this.controls.target : this.lastTarget);
    this.mode = mode;
    this.transitioning = mode !== 'free';
    this.transitionElapsed = 0;
    this.controls.enabled = mode === 'free';
    if (mode === 'free') {
      // 交还控制权前同步观察目标，避免跳变
      this.controls.target.copy(this.lastTarget);
      this.controls.update();
    }
  }

  /** 每帧驱动相机；自由模式下不干预 */
  update(deltaSeconds: number): void {
    if (this.mode === 'free') return;
    this.elapsed += deltaSeconds;

    const sample = this.sampleFlight(this.elapsed);
    let position = sample.position;
    let target = sample.target;

    if (this.transitioning) {
      this.transitionElapsed += deltaSeconds;
      const t = Math.min(this.transitionElapsed / TRANSITION_SECONDS, 1);
      const k = easeInOutCubic(t);
      position = this.fromPosition.clone().lerp(sample.position, k);
      target = this.fromTarget.clone().lerp(sample.target, k);
      if (t >= 1) this.transitioning = false;
    }

    this.camera.position.copy(position);
    this.lastTarget.copy(target);
    this.camera.lookAt(target);
  }

  private sampleFlight(time: number): FlightSample {
    switch (this.mode) {
      case 'deck':
        return this.sampleDeckFlight(time);
      case 'orbit':
        return this.sampleOrbitFlight(time);
      case 'aerial':
        return this.sampleAerialFlight(time);
      default:
        return {
          position: this.camera.position.clone(),
          target: this.controls.target.clone(),
        };
    }
  }

  /** 沿桥面往返巡航，视线朝向前进方向 */
  private sampleDeckFlight(time: number): FlightSample {
    const pathAt = (t: number): THREE.Vector3 =>
      new THREE.Vector3(340 * Math.sin(t * 0.12), DECK_Y + 7, 0);
    const position = pathAt(time);
    // 取样未来路径点作为观察目标，转向自然平滑
    const target = pathAt(time + 1.2);
    target.y = DECK_Y + 5;
    return { position, target };
  }

  /** 环绕一号桥塔盘旋 */
  private sampleOrbitFlight(time: number): FlightSample {
    const angle = time * 0.25;
    const position = new THREE.Vector3(
      -TOWER_X + 95 * Math.cos(angle),
      65 + 8 * Math.sin(time * 0.2),
      95 * Math.sin(angle),
    );
    const target = new THREE.Vector3(-TOWER_X, 55, 0);
    return { position, target };
  }

  /** 高空俯瞰，缓慢环绕全桥 */
  private sampleAerialFlight(time: number): FlightSample {
    const angle = time * 0.05;
    const position = new THREE.Vector3(
      430 * Math.cos(angle),
      300,
      430 * Math.sin(angle),
    );
    const target = new THREE.Vector3(0, DECK_Y, 0);
    return { position, target };
  }
}
