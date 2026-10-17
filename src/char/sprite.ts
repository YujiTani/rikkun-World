// キャラの板（カメラのほうを向く 1 まいの板）。仕様 §4.3・§4.6・§4.8・§5。
// 絵は 色番号 1 バイト（R8 のテクスチャ）で持ち、色見本で 色にもどして描く。描画 1 回・三角形 2。
import * as THREE from 'three';
import type { Lighting } from '../sky/lighting';
import { levelToLinear } from '../sky/lighting';
import { PALETTE_RGB, PALETTE_SIZE } from './palette';
import { MotionMachine, type SpriteMotion, type SpriteScene, type SpriteStepInput, type Want } from './motion';
import {
  CELL,
  CENTER,
  CHAR_HEIGHT,
  DEFAULT_MODEL_H,
  BOW_MOTIONS,
  KATANA_MOTIONS,
  MOTIONS,
  SPAN,
  defaultLoadImage,
  defaultLoadJson,
  indexImage,
  parseAtlasJson,
  type AtlasInfo,
  type LoadImage,
} from './loader';
import { cellRectCrop, unpackCell, type Packed } from './packing';
import { BODY_CENTER_Y, HIDE_DISTANCE, bearingDeg, dirIndex, tierFor } from './view';

export interface CharSpriteDeps {
  parent: THREE.Object3D;
  camera: THREE.Camera;
  lighting: Lighting;
  basePath: string;
  /** 絵を読む関数の差しかえ口（AC32） */
  loadImage?: LoadImage;
  /** atlas.json を読む関数の差しかえ口 */
  loadJson?: (url: string) => Promise<unknown>;
  /** 読みこんだ絵を 先に GPU へ上げる口（S が renderer.initTexture を わたす。なくても動く） */
  initTexture?: (tex: THREE.Texture) => void;
}

export interface SpriteInfo {
  visible: boolean;
  motion: SpriteMotion;
  frame: number;
  dir: number;
  tier: 0 | 1 | 2;
  elevDeg: number;
  /** 板の たてからの かたむき（度） */
  tiltDeg: number;
  /** 板の上向きと カメラの上向きの角（画面の中での かたむき。度） */
  upDeg: number;
  tint: { r: number; g: number; b: number };
  loaded: boolean;
  gpuBytes: number;
  /** どの場面か（§4.1） */
  scene: SpriteScene;
  /** 場面が 見たい絵（読みこみの 代わりの絵にする前） */
  want: Want;
  /** 絵ごとの 読みこみ。none = まだ読みはじめていない */
  status: Record<SpriteMotion, SpriteStatus>;
  /** 板が CPU に 持っている 色番号の バイト（ふだん 0） */
  cpuBytes: number;
}

export interface CharSprite {
  step(input: SpriteStepInput): void;
  render(): void;
  hurt(): void;
  /** 動きの 数えを はじめにもどす（立つ・歩くの コマの数え）。テストで 待ったステップの数に よらず 同じコマにする */
  restartMotion(): void;
  info(): SpriteInfo;
  /** もとの 256 × 256 の コマ（RGBA）。そのたびに 切りつめた PNG を 読みなおして もどす（テスト用） */
  readCell(motion: SpriteMotion, tier: 0 | 1 | 2, dir: number, frame: number): Promise<Uint8ClampedArray>;
  needsBoxDoll(): boolean;
  dispose(): void;
}

/** ダメージの赤み（12 ステップ。もとの色 × 1.0・0.6・0.6） */
export const HURT_STEPS = 12;
export const HURT_TINT = { r: 1.0, g: 0.6, b: 0.6 } as const;

export type SpriteStatus = 'none' | 'loading' | 'ready' | 'failed';

const VERT = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec4 uRect;
uniform vec4 uCrop;
uniform vec2 uSize;
uniform vec3 uPalette[${PALETTE_SIZE + 1}];
uniform vec3 uTint;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  // コマの中の ドット（整数 0〜255。上から）→ 四角の左上を引いて 切りつめた絵の ドット。整数で 引く
  // （もとの格子の絵も 同じ計算。四角の外は とうめい）
  vec2 cp = floor(clamp(vec2(vUv.x, (1.0 - vUv.y)) * 256.0, 0.0, 255.0));
  vec2 d = cp - floor(uCrop.xy * 256.0 + 0.5);
  if (d.x < 0.0 || d.y < 0.0 || d.x >= floor(uCrop.z * 256.0 + 0.5) || d.y >= floor(uCrop.w * 256.0 + 0.5)) discard;
  vec2 t = floor(uRect.xy * uSize + 0.5) + d;
  float idx = floor(texture2D(uMap, (t + 0.5) / uSize).r * 255.0 + 0.5);
  if (idx < 0.5) discard;
  gl_FragColor = vec4(uPalette[int(idx)] * uTint, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const srgbToLinear = (v8: number): number => {
  const c = v8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const RAD = 180 / Math.PI;

export function createCharSprite(deps: CharSpriteDeps): CharSprite {
  const { parent, camera, lighting } = deps;
  const base = deps.basePath.endsWith('/') ? deps.basePath : `${deps.basePath}/`;
  const loadImage = deps.loadImage ?? defaultLoadImage;
  const loadJson = deps.loadJson ?? defaultLoadJson;

  // ---- 板 ----
  const palette: THREE.Vector3[] = [new THREE.Vector3()];
  for (const c of PALETTE_RGB) palette.push(new THREE.Vector3(srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])));
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uMap: { value: null as THREE.Texture | null },
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uPalette: { value: palette },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
    },
  ]);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    side: THREE.DoubleSide,
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.name = 'charSprite';
  // 影を落とす板（ShadowSystem）用: 段・向きを 指定して、いまの動き・コマの 四角を rect / crop に書く。絵が まだ無ければ false
  mesh.userData.cardCell = (t: number, d: number, rect: THREE.Vector4, crop: THREE.Vector4): boolean => {
    const v = view();
    const a = loadedInfo[v.motion];
    if (!textures[v.motion] || !a) return false;
    const u = cellRectCrop(a, t * 8 + d, v.frame);
    rect.set(u.rect[0], u.rect[1], u.rect[2], u.rect[3]);
    crop.set(u.crop[0], u.crop[1], u.crop[2], u.crop[3]);
    return true;
  };
  parent.add(mesh);

  let modelH = DEFAULT_MODEL_H;
  let centerY = (CENTER * CHAR_HEIGHT) / modelH;
  const applySize = (): void => {
    const k = CHAR_HEIGHT / modelH;
    mesh.scale.set(SPAN * k, SPAN * k, 1);
    centerY = CENTER * k;
    mesh.position.set(0, centerY, 0);
  };
  applySize();

  // ---- 読みこみ ----
  /** 読みおえた絵の 大きさ・四角の表（色番号の写しは 持たない） */
  interface Loaded {
    width: number;
    height: number;
    cols: number;
    packed?: Packed;
  }
  const status = {} as Record<SpriteMotion, SpriteStatus>;
  const loadedInfo = {} as Record<SpriteMotion, Loaded | undefined>;
  const textures = {} as Record<SpriteMotion, THREE.DataTexture | undefined>;
  for (const m of MOTIONS) status[m] = 'none';
  let atlasInfo: AtlasInfo | null = null;
  let atlasSettled = false;
  let disposed = false;
  let gpuBytes = 0;
  /** GPU へ まだ上がっていない 色番号の写しの バイト */
  let cpuPending = 0;

  const atlasP: Promise<void> = loadJson(`${base}atlas.json`)
    .then((raw) => {
      atlasInfo = parseAtlasJson(raw);
      if (!disposed) {
        modelH = atlasInfo.modelH;
        applySize();
      }
    })
    .catch(() => undefined)
    .then(() => {
      atlasSettled = true;
    });

  /** 1 まい読む（失敗しても 投げない）。読んだ色番号は GPU へ渡して すてる */
  const loadMotion = async (m: SpriteMotion): Promise<void> => {
    status[m] = 'loading';
    try {
      const [img] = await Promise.all([loadImage(`${base}${m}.png`), atlasP]);
      if (disposed) return;
      const mi = atlasInfo?.motions[m];
      const a = indexImage(`${base}${m}.png`, img, mi?.packed, mi?.frames);
      const tex = new THREE.DataTexture(a.indices, a.width, a.height, THREE.RedFormat, THREE.UnsignedByteType);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.unpackAlignment = 1;
      // GPU へ上がったら CPU の写しを すてる
      const bytes = a.indices.byteLength;
      cpuPending += bytes;
      tex.onUpdate = () => {
        const img = tex.image as { data: unknown };
        if (img.data !== null) cpuPending -= bytes;
        img.data = null;
      };
      tex.needsUpdate = true;
      loadedInfo[m] = { width: a.width, height: a.height, cols: a.cols, ...(a.packed ? { packed: a.packed } : {}) };
      textures[m] = tex;
      gpuBytes += a.width * a.height;
      status[m] = 'ready';
      // 始めて使うときの カクつきを防ぐ
      try {
        deps.initTexture?.(tex);
      } catch {
        /* 先に上げられなくても 使うときに上がる */
      }
    } catch (e) {
      status[m] = 'failed';
      console.warn(`[char] ${m} の絵を読めませんでした。代わりの絵を使います`, e);
    }
  };

  // 読む順（1 まいずつ）。はじめの組 → 刀・弓の組
  let chain: Promise<void> = (async () => {
    await Promise.all([loadMotion('idle'), loadMotion('walk'), atlasP]);
    // はしる・ジャンプは あとから（始めの読みこみを軽くする）
    await Promise.all([loadMotion('run'), loadMotion('jump')]);
  })();
  const enqueue = (list: readonly SpriteMotion[]): void => {
    chain = chain.then(async () => {
      for (const m of list) {
        if (disposed) return;
        await loadMotion(m);
      }
    });
  };
  const requested = { katana: false, bow: false };

  const loaded = (): boolean => status.idle === 'ready' && status.walk !== 'loading' && status.walk !== 'none' && atlasSettled;

  const ready = (m: SpriteMotion): boolean => status[m] === 'ready';
  let lastRunning = false;

  /** 絵が読めていない動きは 代わりの動きの絵にする（§5）。frame も そろえる */
  const baseMotion = (m: 'walk' | 'run' | 'jump' | 'idle'): SpriteMotion => {
    if (m === 'run') return ready('run') ? 'run' : ready('walk') ? 'walk' : 'idle';
    if (m === 'walk') return ready('walk') ? 'walk' : 'idle';
    if (m === 'jump') return ready('jump') ? 'jump' : 'idle';
    return 'idle';
  };
  const walkish = (): SpriteMotion => baseMotion(lastRunning ? 'run' : 'walk');
  const substitute = (w: Want): Want => {
    const m = w.motion;
    let out: SpriteMotion;
    switch (m) {
      case 'idle':
      case 'walk':
      case 'run':
      case 'jump':
        out = baseMotion(m);
        break;
      case 'katana_walk_chudan':
      case 'katana_walk_jodan':
      case 'katana_walk_gedan':
        out = ready(m) ? m : walkish();
        break;
      case 'bow_walk':
        out = ready('bow_walk') ? 'bow_walk' : ready('bow_hold_walk') ? 'bow_hold_walk' : walkish();
        break;
      case 'bow_hold_walk':
        out = ready('bow_hold_walk') ? 'bow_hold_walk' : ready('bow_walk') ? 'bow_walk' : walkish();
        break;
      default:
        out = ready(m) ? m : 'idle'; // わざ・かまえ・bow_shot・bow_rapid
    }
    return { motion: out, frame: out === 'idle' && m !== 'idle' ? 0 : w.frame };
  };

  // ---- 動き・赤み ----
  const machine = new MotionMachine();
  let hurtAge = Number.MAX_SAFE_INTEGER;

  // ---- 向き（render で決める） ----
  let dir = 0;
  let tier: 0 | 1 | 2 = 0;
  let elevDeg = 0;
  let tiltDeg = 0;
  let upDeg = 0;
  let facing = 0;

  const tmpFeet = new THREE.Vector3();
  const tmpCam = new THREE.Vector3();
  const tmpZ = new THREE.Vector3();
  const tmpX = new THREE.Vector3();
  const tmpY = new THREE.Vector3();
  const tmpF = new THREE.Vector3();
  const tmpU = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpPQ = new THREE.Quaternion();

  const tintValues = (): { r: number; g: number; b: number } => {
    const level = lighting.level('doll');
    const hurt = hurtAge <= HURT_STEPS;
    return {
      r: level * (hurt ? HURT_TINT.r : 1),
      g: level * (hurt ? HURT_TINT.g : 1),
      b: level * (hurt ? HURT_TINT.b : 1),
    };
  };

  /** 場面と、読みこみの代わりの絵まで 決めた 見せる絵 */
  const view = (): { scene: SpriteScene; motion: SpriteMotion; frame: number } => {
    let scene = machine.scene;
    let w: Want = machine.want;
    // bow_rapid が読めていないときは 連射も bow_shot の 同じ場面の決まりで
    if (w.motion === 'bow_rapid' && !ready('bow_rapid') && machine.alt) {
      scene = machine.alt.scene;
      w = { motion: machine.alt.motion, frame: machine.alt.frame };
    }
    const r = substitute(w);
    return { scene, motion: r.motion, frame: r.frame };
  };

  function render(): void {
    parent.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    tmpFeet.setFromMatrixPosition(parent.matrixWorld);
    tmpCam.setFromMatrixPosition(camera.matrixWorld);

    const dx = tmpCam.x - tmpFeet.x;
    const dz = tmpCam.z - tmpFeet.z;
    const horiz = Math.hypot(dx, dz);
    const dyBody = tmpCam.y - (tmpFeet.y + BODY_CENTER_Y);
    elevDeg = Math.atan2(dyBody, horiz) * RAD;
    tier = tierFor(elevDeg);
    dir = dirIndex(bearingDeg(dx, dz), facing);

    const isLoaded = loaded();
    const farEnough = Math.hypot(dx, dyBody, dz) >= HIDE_DISTANCE;
    mesh.visible = isLoaded && farEnough;

    // 板の向き
    parent.getWorldQuaternion(tmpPQ).invert();
    if (tier === 0) {
      // たての軸だけ回して カメラの方を向く
      tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(dx, dz));
      tiltDeg = 0;
      upDeg = 0;
    } else {
      // 面を カメラの位置へまっすぐ向け、板の上は カメラの上向き（画面の上）にそろえる
      tmpZ.set(dx, tmpCam.y - (tmpFeet.y + centerY), dz);
      if (tmpZ.lengthSq() < 1e-12) tmpZ.set(0, 1, 0);
      tmpZ.normalize();
      tmpX.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      tmpX.addScaledVector(tmpZ, -tmpX.dot(tmpZ));
      if (tmpX.lengthSq() < 1e-8) tmpX.setFromMatrixColumn(camera.matrixWorld, 1).cross(tmpZ);
      tmpX.normalize();
      tmpY.crossVectors(tmpZ, tmpX);
      tmpM.makeBasis(tmpX, tmpY, tmpZ);
      tmpQ.setFromRotationMatrix(tmpM);
      tiltDeg = Math.abs(Math.asin(Math.min(1, Math.max(-1, tmpZ.y)))) * RAD;
      // 画面の中でのかたむき: 板の上を カメラの画面の面に うつして、カメラの上向きとの角を見る
      tmpF.setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize();
      tmpU.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      tmpY.addScaledVector(tmpF, -tmpY.dot(tmpF));
      const len = tmpY.length();
      upDeg = len < 1e-8 ? 0 : Math.acos(Math.min(1, Math.max(-1, tmpY.divideScalar(len).dot(tmpU)))) * RAD;
    }
    mesh.quaternion.copy(tmpPQ).multiply(tmpQ);

    // 絵と色
    const v = view();
    const tex = textures[v.motion];
    const a = loadedInfo[v.motion];
    if (tex && a) {
      const row = tier * 8 + dir;
      uniforms.uMap!.value = tex;
      (uniforms.uSize!.value as THREE.Vector2).set(a.width, a.height);
      const u = cellRectCrop(a, row, v.frame);
      (uniforms.uRect!.value as THREE.Vector4).set(u.rect[0], u.rect[1], u.rect[2], u.rect[3]);
      (uniforms.uCrop!.value as THREE.Vector4).set(u.crop[0], u.crop[1], u.crop[2], u.crop[3]);
    }
    const t = tintValues();
    (uniforms.uTint!.value as THREE.Vector3).set(levelToLinear(t.r), levelToLinear(t.g), levelToLinear(t.b));
  }

  const startWeaponLoads = (weapon: SpriteStepInput['weapon']): void => {
    if (weapon === 'katana' && !requested.katana) {
      requested.katana = true;
      enqueue(KATANA_MOTIONS);
    } else if (weapon === 'bow' && !requested.bow) {
      requested.bow = true;
      enqueue(BOW_MOTIONS);
    }
  };

  const transparentCell = (): Uint8ClampedArray => new Uint8ClampedArray(CELL * CELL * 4);

  return {
    step(input) {
      startWeaponLoads(input.weapon);
      machine.step(input);
      lastRunning = input.running;
      facing = input.facingDeg;
      hurtAge = Math.min(hurtAge + 1, Number.MAX_SAFE_INTEGER);
    },
    render,
    hurt() {
      hurtAge = 0;
    },
    restartMotion() {
      machine.reset();
    },
    info() {
      const v = view();
      return {
        visible: mesh.visible,
        motion: v.motion,
        frame: v.frame,
        dir,
        tier,
        elevDeg,
        tiltDeg,
        upDeg,
        tint: tintValues(),
        loaded: loaded(),
        gpuBytes,
        scene: v.scene,
        want: machine.want,
        status: { ...status },
        cpuBytes: cpuPending,
      };
    },
    async readCell(motion, t, d, frame) {
      const out = transparentCell();
      try {
        const url = `${base}${motion}.png`;
        const [img] = await Promise.all([loadImage(url), atlasP]);
        const mi = atlasInfo?.motions[motion];
        const a = indexImage(url, img, mi?.packed, mi?.frames);
        const row = t * 8 + d;
        let idx: Uint8Array;
        if (a.packed) {
          const cell = a.packed.cells[row * a.cols + frame];
          if (!cell) return out;
          idx = unpackCell(a.indices, a.width, cell);
        } else {
          idx = new Uint8Array(CELL * CELL);
          for (let y = 0; y < CELL; y++) {
            const src = (row * CELL + y) * a.width + frame * CELL;
            idx.set(a.indices.subarray(src, src + CELL), y * CELL);
          }
        }
        for (let i = 0; i < CELL * CELL; i++) {
          const k = idx[i]!;
          if (k === 0) continue;
          const c = PALETTE_RGB[k - 1]!;
          const o = i * 4;
          out[o] = c[0];
          out[o + 1] = c[1];
          out[o + 2] = c[2];
          out[o + 3] = 255;
        }
      } catch (e) {
        console.warn(`[char] readCell: ${motion} を読めませんでした`, e);
      }
      return out;
    },
    needsBoxDoll() {
      return status.idle === 'failed';
    },
    dispose() {
      disposed = true;
      parent.remove(mesh);
      geometry.dispose();
      material.dispose();
      for (const m of MOTIONS) textures[m]?.dispose();
    },
  };
}
