// window.__rikkun.shadow（SHADOW.md §8.1、正本は e2e/helpers/shadow.ts の上の説明）。
// 影のしくみを作っていない（?shadow=0）ときも、窓口はある（enabled() は false、調べる物は何もしない）。
import * as THREE from 'three';
import type { ArrayVoxelWorld } from '../../VoxelWorld';
import { isOpaqueIndex } from '../../blocks/blockTypes';
import { SHADOW_FRAG_PARS } from './shadowGlsl';
import { shadowPatch } from './shadowPatch';
import type { ShadowStatsHook, ShadowSystem } from './ShadowSystem';

export interface Shade {
  r: number;
  g: number;
  b: number;
  luma: number;
}

export interface ShadowHookDeps {
  system: ShadowSystem | null;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: ArrayVoxelWorld;
  player: () => { x: number; y: number; z: number };
  /** tick を 1 つ進める */
  step(n: number): void;
  /** いま 1 回 描く */
  renderNow(): void;
  /** 設定の「かげ」を変える（画面のボタンと同じ道すじ） */
  setEnabled(on: boolean): void;
}

const ZERO_STATS: ShadowStatsHook = {
  enabled: false,
  redraws: { near: 0, far: 0, dynamic: 0 },
  frame: { staticRedrawn: [], draws: 0, triangles: 0, maxStaticPerFrame: 0 },
  light: { x: 0, y: 1, z: 0, strength: 0, body: 'sun' },
  torch: { count: 0, redraws: 0, frameRedrawn: 0, frameDraws: 0, frameTriangles: 0 },
};

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function createShadowHook(d: ShadowHookDeps) {
  const sys = d.system;
  // 光がとどく割合を 1 画素に描く（影の地図の答えを そのまま色にする）
  let probe: { rt: THREE.WebGLRenderTarget; scene: THREE.Scene; cam: THREE.Camera; at: { value: THREE.Vector3 } } | null = null;
  let shotRt: THREE.WebGLRenderTarget | null = null;
  const buf = new Uint8Array(4);

  const ensureProbe = () => {
    if (probe) return probe;
    const at = { value: new THREE.Vector3() };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shadowPatch.uniforms, uProbe: at },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `${SHADOW_FRAG_PARS}\nuniform vec3 uProbe;\nvoid main(){ gl_FragColor = vec4(shSunVis(uProbe, vec3(0.0, 1.0, 0.0), true), 0.0, 0.0, 1.0); }`,
      depthTest: false,
      depthWrite: false,
    });
    const s = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    s.add(quad);
    probe = { rt: new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType }), scene: s, cam: new THREE.Camera(), at };
    return probe;
  };

  /** 本物の材料で 1 画素描く用（画面に出る色 = sRGB のまま読む） */
  const ensureShot = () => (shotRt ??= new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace }));

  const readShade = (rt: THREE.WebGLRenderTarget): Shade => {
    d.renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, buf);
    const r = buf[0]! / 255;
    const g = buf[1]! / 255;
    const b = buf[2]! / 255;
    return { r, g, b, luma: luma(r, g, b) };
  };

  const withTarget = <T>(rt: THREE.WebGLRenderTarget, fn: () => T): T => {
    const r = d.renderer;
    const prevRt = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.setRenderTarget(rt);
    r.autoClear = true;
    try {
      return fn();
    } finally {
      r.setRenderTarget(prevRt);
      r.autoClear = prevAuto;
    }
  };

  return {
    enabled: (): boolean => sys?.enabled ?? false,
    set: (on: boolean): void => d.setEnabled(on),
    stats: (): ShadowStatsHook => (sys ? sys.stats() : { ...ZERO_STATS }),
    resetStats: (): void => sys?.resetStats(),
    /** tick を 1 つずつ進め、renderEvery 個ごとに 1 回 描く（壁の時計に左右されずに 地図の描き直しを数える） */
    advance: (ticks: number, renderEvery = 1): void => {
      for (let i = 1; i <= ticks; i++) {
        d.step(1);
        if (i % renderEvery === 0) d.renderNow();
      }
    },
    /** その点（y = 面の高さ）に 日・月の光がとどく割合 0..1。影の地図の答え（動く物の地図も入る） */
    visAt: (x: number, y: number, z: number): number => {
      if (!sys) return 1;
      sys.sync();
      const p = ensureProbe();
      p.at.value.set(x, y, z);
      return withTarget(p.rt, () => {
        d.renderer.render(p.scene, p.cam);
        d.renderer.readRenderTargetPixels(p.rt, 0, 0, 1, 1, buf);
        return buf[0]! / 255;
      });
    },
    /** CPU で ブロック単位に 光（太陽か月）へ 1 本とばした答え（正解） */
    rayBlocked: (x: number, y: number, z: number): boolean => {
      const l = sys ? sys.light.dir : { x: 0, y: 1, z: 0 };
      if (l.y <= 0.001) return false;
      const step = 0.05;
      for (let t = 0.05; t < 120; t += step) {
        const px = x + l.x * t;
        const py = y + 0.01 + l.y * t;
        const pz = z + l.z * t;
        if (py > d.world.size.y + 2) return false;
        const b = d.world.getIndex(Math.floor(px), Math.floor(py), Math.floor(pz));
        if (b > 0 && isOpaqueIndex(b)) return true;
      }
      return false;
    },
    /** その点を 真上から 1 画素 本物の材料で描いた色（shadow を false にすると その 1 回だけ 影なし） */
    shadeAt: (x: number, y: number, z: number, opt: { shadow?: boolean } = {}): Shade => {
      const cam = new THREE.OrthographicCamera(-0.004, 0.004, 0.004, -0.004, 0.1, 8);
      cam.position.set(x, y + 3, z);
      cam.rotation.x = -Math.PI / 2;
      cam.updateMatrixWorld(true);
      const rt = ensureShot();
      const render = () => withTarget(rt, () => {
        d.renderer.render(d.scene, cam);
        return readShade(rt);
      });
      return sys ? sys.withShadow(opt.shadow !== false, render) : render();
    },
    /** キャラの体の中心を ゲームのカメラで 1 画素 描いた色 */
    shadeChar: (opt: { shadow?: boolean } = {}): Shade => {
      const p = d.player();
      const size = d.renderer.getDrawingBufferSize(new THREE.Vector2());
      const v = new THREE.Vector3(p.x, p.y + 0.9, p.z).project(d.camera);
      const px = Math.min(size.x - 1, Math.max(0, Math.floor((v.x * 0.5 + 0.5) * size.x)));
      const py = Math.min(size.y - 1, Math.max(0, Math.floor((1 - (v.y * 0.5 + 0.5)) * size.y)));
      const rt = ensureShot();
      const render = () => withTarget(rt, () => {
        d.camera.setViewOffset(size.x, size.y, px, py, 1, 1);
        try {
          d.renderer.render(d.scene, d.camera);
        } finally {
          d.camera.clearViewOffset();
        }
        return readShade(rt);
      });
      return sys ? sys.withShadow(opt.shadow !== false, render) : render();
    },
  };
}

export type ShadowHook = ReturnType<typeof createShadowHook>;
