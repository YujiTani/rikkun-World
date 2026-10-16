// キャラの板（カメラのほうを向く 1 まいの板）。仕様 §4.3・§4.6・§4.8・§5。
// 絵は 色番号 1 バイト（R8 のテクスチャ）で持ち、色見本で 色にもどして描く。描画 1 回・三角形 2。
import * as THREE from 'three';
import type { Lighting } from '../sky/lighting';
import { levelToLinear } from '../sky/lighting';
import { PALETTE_RGB, PALETTE_SIZE } from './palette';
import { MotionMachine, type SpriteMotion, type SpriteStepInput } from './motion';
import {
  CELL,
  CENTER,
  CHAR_HEIGHT,
  DEFAULT_MODEL_H,
  MOTIONS,
  SPAN,
  defaultLoadImage,
  defaultLoadJson,
  loadIndexedAtlas,
  parseAtlasJson,
  type IndexedAtlas,
  type LoadImage,
} from './loader';
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
}

export interface CharSprite {
  step(input: SpriteStepInput): void;
  render(): void;
  hurt(): void;
  info(): SpriteInfo;
  readCell(motion: SpriteMotion, tier: 0 | 1 | 2, dir: number, frame: number): Uint8ClampedArray;
  needsBoxDoll(): boolean;
  dispose(): void;
}

/** ダメージの赤み（12 ステップ。もとの色 × 1.0・0.6・0.6） */
export const HURT_STEPS = 12;
export const HURT_TINT = { r: 1.0, g: 0.6, b: 0.6 } as const;

type Status = 'loading' | 'ready' | 'failed';

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
uniform vec3 uPalette[${PALETTE_SIZE + 1}];
uniform vec3 uTint;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float idx = floor(texture2D(uMap, uRect.xy + vUv * uRect.zw).r * 255.0 + 0.5);
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
  const status = {} as Record<SpriteMotion, Status>;
  const atlases = {} as Record<SpriteMotion, IndexedAtlas | undefined>;
  const textures = {} as Record<SpriteMotion, THREE.DataTexture | undefined>;
  for (const m of MOTIONS) status[m] = 'loading';
  let atlasSettled = false;
  let disposed = false;
  let gpuBytes = 0;

  const loadMotion = async (m: SpriteMotion): Promise<void> => {
    try {
      const a = await loadIndexedAtlas(`${base}${m}.png`, loadImage);
      if (disposed) return;
      const tex = new THREE.DataTexture(a.indices, a.width, a.height, THREE.RedFormat, THREE.UnsignedByteType);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.unpackAlignment = 1;
      tex.needsUpdate = true;
      atlases[m] = a;
      textures[m] = tex;
      gpuBytes += a.width * a.height;
      status[m] = 'ready';
    } catch (e) {
      status[m] = 'failed';
      console.warn(`[char] ${m} の絵を読めませんでした。代わりの絵を使います`, e);
    }
  };

  void (async () => {
    const atlasP = loadJson(`${base}atlas.json`)
      .then((raw) => {
        const h = parseAtlasJson(raw).modelH;
        if (!disposed) {
          modelH = h;
          applySize();
        }
      })
      .catch(() => undefined)
      .then(() => {
        atlasSettled = true;
      });
    await Promise.all([loadMotion('idle'), loadMotion('walk'), atlasP]);
    // はしる・ジャンプは あとから（始めの読みこみを軽くする）
    await Promise.all([loadMotion('run'), loadMotion('jump')]);
  })();

  const loaded = (): boolean => status.idle === 'ready' && status.walk !== 'loading' && atlasSettled;

  /** 絵が読めていない動きは 代わりの動きの絵にする（§5） */
  const effective = (m: SpriteMotion): SpriteMotion => {
    if (m === 'run') return status.run === 'ready' ? 'run' : status.walk === 'ready' ? 'walk' : 'idle';
    if (m === 'walk') return status.walk === 'ready' ? 'walk' : 'idle';
    if (m === 'jump') return status.jump === 'ready' ? 'jump' : 'idle';
    return 'idle';
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

  const effectiveFrame = (): number => (machine.motion === 'jump' && effective('jump') !== 'jump' ? 0 : machine.frame);

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
    const m = effective(machine.motion);
    const tex = textures[m];
    const a = atlases[m];
    if (tex && a) {
      const f = Math.min(effectiveFrame(), a.cols - 1);
      const row = tier * 8 + dir;
      uniforms.uMap!.value = tex;
      (uniforms.uRect!.value as THREE.Vector4).set(f / a.cols, 1 - (row + 1) / a.rows, 1 / a.cols, 1 / a.rows);
    }
    const t = tintValues();
    (uniforms.uTint!.value as THREE.Vector3).set(levelToLinear(t.r), levelToLinear(t.g), levelToLinear(t.b));
  }

  return {
    step(input) {
      machine.step(input);
      facing = input.facingDeg;
      hurtAge = Math.min(hurtAge + 1, Number.MAX_SAFE_INTEGER);
    },
    render,
    hurt() {
      hurtAge = 0;
    },
    info() {
      return {
        visible: mesh.visible,
        motion: effective(machine.motion),
        frame: effectiveFrame(),
        dir,
        tier,
        elevDeg,
        tiltDeg,
        upDeg,
        tint: tintValues(),
        loaded: loaded(),
        gpuBytes,
      };
    },
    readCell(motion, t, d, frame) {
      const out = new Uint8ClampedArray(CELL * CELL * 4);
      const a = atlases[motion];
      if (!a) return out;
      const x0 = frame * CELL;
      const y0 = (t * 8 + d) * CELL;
      for (let y = 0; y < CELL; y++) {
        const src = (y0 + y) * a.width + x0;
        for (let x = 0; x < CELL; x++) {
          const idx = a.indices[src + x]!;
          if (idx === 0) continue;
          const c = PALETTE_RGB[idx - 1]!;
          const o = (y * CELL + x) * 4;
          out[o] = c[0];
          out[o + 1] = c[1];
          out[o + 2] = c[2];
          out[o + 3] = 255;
        }
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
