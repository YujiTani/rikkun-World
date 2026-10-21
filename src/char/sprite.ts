// キャラの板（カメラのほうを向く 1 まいの板）。仕様 §4.3・§4.6・§4.8・§5。
// 絵は 色番号 1 バイト（R8 のテクスチャ）で持ち、色見本で 色にもどして描く。描画 1 回・三角形 2。
import * as THREE from 'three';
import type { Lighting } from '../sky/lighting';
import { levelToLinear } from '../sky/lighting';
import { EXTRA_COLORS_MAX, PALETTE_RGB, PALETTE_SLOTS, type PaletteRgb } from './palette';
import { MotionMachine, type SpriteMotion, type SpriteScene, type SpriteStepInput, type Want } from './motion';
import {
  CELL,
  CENTER,
  CHAR_HEIGHT,
  DEFAULT_MODEL_H,
  BOW_MOTIONS,
  KATANA_MOTIONS,
  MOTIONS,
  PARRY_MOTIONS,
  SPAN,
  defaultLoadImage,
  defaultLoadJson,
  indexImage,
  parseAtlasJson,
  type AtlasInfo,
  type LoadImage,
} from './loader';
import type { ParryCell } from './parryCells';
import { cellRectCrop, parsePacked, unpackCell, type Packed } from './packing';
import { BODY_CENTER_Y, HIDE_DISTANCE, bearingDeg, dirIndex, tierFor } from './view';

export type CharKind = 'girl' | 'boy';

export interface CharSpriteDeps {
  parent: THREE.Object3D;
  /** CHAR-5: 板が 出すキャラ（なければ girl） */
  kind?: CharKind;
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
  /** CHAR-4: いま 板が 使っている 刃の色（なければ null） */
  bladeColors: { body: number; shine: number } | null;
  /** CHAR-5: 板が 今 出している キャラ */
  kind: CharKind;
  /** WEAPON-9: 刀の組に 差しかえて いる 絵の 名前（なければ null） */
  skin: string | null;
  /** CHAR-5: 板の 色見本 22 色（0〜255。刃の色の ぬりかえ前） */
  palette: number[][];
}

export interface CharSprite {
  step(input: SpriteStepInput): void;
  render(): void;
  hurt(): void;
  /** WEAPON-5: パリィの 絵を 見せる（null で 元に もどす。絵が 読めていなければ そのまま） */
  setParry(cell: ParryCell | null): void;
  /** WEAPON-5: パリィの 絵を 先に 読む（刀を 持ったとき。何度 呼んでもよい） */
  preloadParry(): void;
  /** WEAPON-5: 青白い 光（0〜1）で からだの 色を 水色へ まぜる */
  setGlow(level: number): void;
  /** 動きの 数えを はじめにもどす（立つ・歩くの コマの数え）。テストで 待ったステップの数に よらず 同じコマにする */
  restartMotion(): void;
  info(): SpriteInfo;
  /** もとの 256 × 256 の コマ（RGBA）。そのたびに 切りつめた PNG を 読みなおして もどす（テスト用） */
  readCell(motion: SpriteMotion, tier: 0 | 1 | 2, dir: number, frame: number): Promise<Uint8ClampedArray>;
  /** CHAR-5: キャラを 切りかえる。前の キャラの 絵を ぜんぶ おろし、新しい キャラの はじめの 4 つを 読む。同じ キャラなら 何もしない */
  setChar(kind: CharKind, basePath: string): void;
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
uniform vec3 uPalette[${PALETTE_SLOTS}];
uniform vec3 uTint;
uniform float uMix;
uniform vec3 uMixColor;
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
  gl_FragColor = vec4(mix(uPalette[int(idx)], uMixColor, uMix) * uTint, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** 影の差し込み（shadowPatch.patchSpriteMaterial）が この絵の シェーダーで 通るかを テストで 見る（#199） */
export const SPRITE_SHADERS = { vertex: VERT, fragment: FRAG } as const;

const srgbToLinear = (v8: number): number => {
  const c = v8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const RAD = 180 / Math.PI;

export function createCharSprite(deps: CharSpriteDeps): CharSprite {
  const { parent, camera, lighting } = deps;
  const withSlash = (p: string): string => (p.endsWith('/') ? p : `${p}/`);
  let base = withSlash(deps.basePath);
  let kind: CharKind = deps.kind ?? 'girl';
  /** 切りかえのたびに ふえる。古い読みこみは これが ちがえば すてる */
  let gen = 0;
  /** そのキャラの 色見本（atlas.json の palette。なければ 女の子） */
  let curPalette: PaletteRgb = PALETTE_RGB;
  const loadImage = deps.loadImage ?? defaultLoadImage;
  const loadJson = deps.loadJson ?? defaultLoadJson;

  // ---- 板 ----
  const palette: THREE.Vector3[] = [new THREE.Vector3()];
  for (const c of PALETTE_RGB) palette.push(new THREE.Vector3(srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])));
  for (let i = 0; i < EXTRA_COLORS_MAX; i++) palette.push(new THREE.Vector3()); // 手に 持つ 絵の ための 席
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uMap: { value: null as THREE.Texture | null },
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uPalette: { value: palette },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
      uMix: { value: 0 },
      uMixColor: { value: new THREE.Vector3(srgbToLinear(0xd6), srgbToLinear(0xf4), srgbToLinear(0xff)) },
    },
  ]);
  // CHAR-4: 色見本の 20・21 番（色番号 21・22）= 刃の地・ふちの光。武器の色に ぬりかえる
  let bladeColors: { body: number; shine: number } | null = null;
  const setBladeColors = (bc: { body: number; shine: number } | null): void => {
    if (bc?.body === bladeColors?.body && bc?.shine === bladeColors?.shine) return;
    bladeColors = bc ? { body: bc.body, shine: bc.shine } : null;
    const set = (i: number, hex: number | null): void => {
      const c = hex === null ? curPalette[i]! : [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      (uniforms.uPalette!.value as THREE.Vector3[])[i + 1]!.set(srgbToLinear(c[0]!), srgbToLinear(c[1]!), srgbToLinear(c[2]!));
    };
    set(20, bc ? bc.body : null);
    set(21, bc ? bc.shine : null);
  };
  /** 色見本を 板の 表に 書く（刃の色の ぬりかえが 出ていれば 20・21 番は それを 残す） */
  const applyPalette = (): void => {
    const u = uniforms.uPalette!.value as THREE.Vector3[];
    curPalette.forEach((c, i) => u[i + 1]!.set(srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])));
    if (bladeColors) {
      const bc = bladeColors;
      bladeColors = null;
      setBladeColors(bc);
    }
  };
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
  // 影を落とす板（ShadowSystem）用: 段・向きを 指定して、いまの動き・コマの 四角を rect / crop に、絵と大きさを map / size に書く。
  // 絵が まだ無ければ false（板の uniform とは べつの入れ物に書くので、render の前後で ずれない）
  mesh.userData.cardCell = (t: number, d: number, rect: THREE.Vector4, crop: THREE.Vector4, map: { value: THREE.Texture | null }, size: THREE.Vector2): boolean => {
    const v = view();
    const a = loadedInfo[v.motion];
    const tex = textures[v.motion];
    if (!tex || !a) return false;
    const u = cellRectCrop(a, t * 8 + d, v.frame);
    rect.set(u.rect[0], u.rect[1], u.rect[2], u.rect[3]);
    crop.set(u.crop[0], u.crop[1], u.crop[2], u.crop[3]);
    map.value = tex;
    size.set(a.width, a.height);
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
  // ---- WEAPON-9: 手に 持つ 絵の 差しかえ（虹の 太刀）。刀の組 6 まいを 入れかえる（足さない）
  interface SkinAtlas {
    extras: PaletteRgb;
    motions: Record<string, { frames: number; packed?: Packed }>;
  }
  const skinAtlases = new Map<string, Promise<SkinAtlas | null>>();
  const loadedSkin = {} as Record<SpriteMotion, string | null | undefined>;
  let wantSkin: string | null = null;
  const KATANA_SET: ReadonlySet<SpriteMotion> = new Set(KATANA_MOTIONS);
  const skinAtlas = (name: string): Promise<SkinAtlas | null> => {
    let p = skinAtlases.get(name);
    if (!p) {
      p = loadJson(`${base}${name}/atlas.json`)
        .then((raw) => {
          const o = (raw ?? {}) as { extras?: unknown; motions?: Record<string, { frames?: number; packed?: unknown }> };
          const extras = (Array.isArray(o.extras) ? o.extras : []).slice(0, EXTRA_COLORS_MAX).map((c) => [Number((c as number[])[0]), Number((c as number[])[1]), Number((c as number[])[2])] as [number, number, number]);
          const motions: SkinAtlas['motions'] = {};
          for (const [k, v] of Object.entries(o.motions ?? {})) {
            const packed = parsePacked(v?.packed);
            motions[k] = { frames: Number(v?.frames) || 8, ...(packed ? { packed } : {}) };
          }
          // 板の 色見本の 席(23〜)に 書く
          const u = uniforms.uPalette!.value as THREE.Vector3[];
          extras.forEach((c, i) => u[PALETTE_RGB.length + 1 + i]!.set(srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])));
          return { extras, motions };
        })
        .catch(() => null);
      skinAtlases.set(name, p);
    }
    return p;
  };
  let atlasSettled = false;
  let disposed = false;
  let gpuBytes = 0;
  /** GPU へ まだ上がっていない 色番号の写しの バイト */
  let cpuPending = 0;
  let atlasP: Promise<void> = Promise.resolve();
  let chain: Promise<void> = Promise.resolve();

  const startAtlas = (): void => {
    const g = gen;
    const url = `${base}atlas.json`;
    atlasInfo = null;
    atlasSettled = false;
    atlasP = loadJson(url)
      .then((raw) => {
        if (g !== gen || disposed) return;
        atlasInfo = parseAtlasJson(raw);
        modelH = atlasInfo.modelH;
        curPalette = atlasInfo.palette ?? PALETTE_RGB;
        applyPalette();
        applySize();
      })
      .catch(() => undefined)
      .then(() => {
        if (g === gen) atlasSettled = true;
      });
  };

  const GPU_LIMIT = 67_108_864;
  const dropBow = (): void => {
    for (const bm of BOW_MOTIONS) {
      const t = textures[bm];
      if (!t) continue;
      const oi = loadedInfo[bm];
      if (oi) gpuBytes -= oi.width * oi.height;
      const od = t.image as { data: Uint8Array | null };
      if (od.data !== null) {
        cpuPending -= od.data.byteLength;
        od.data = null;
      }
      t.dispose();
      textures[bm] = undefined;
      loadedInfo[bm] = undefined;
      status[bm] = 'none';
    }
    requested.bow = false;
  };

  /** 1 まい読む（失敗しても 投げない）。読んだ色番号は GPU へ渡して すてる。g が 今の世代と ちがえば 何もしない。
   *  刀の組は wantSkin の 絵（虹の 太刀）を 読む。読めたら 前の 絵と 入れかえる（その間 前の 絵を 見せる） */
  const loadMotion = async (m: SpriteMotion, g: number): Promise<void> => {
    if (g !== gen || disposed) return;
    const had = status[m] === 'ready';
    if (!had) status[m] = 'loading';
    const myBase = base;
    const myAtlasP = atlasP;
    const sk = kind === 'girl' && KATANA_SET.has(m) ? wantSkin : null;
    try {
      const skinA = sk ? await skinAtlas(sk) : null;
      if (sk && !skinA?.motions[m]) throw new Error(`${sk} の 絵の 表が ありません`);
      const url = sk ? `${myBase}${sk}/${m}.png` : `${myBase}${m}.png`;
      const [img] = await Promise.all([loadImage(url), myAtlasP]);
      if (disposed || g !== gen) return; // 切りかえの 前に 始めた読みこみ: すてる
      if (sk && wantSkin !== sk) {
        // 読んでいる 間に 持ちかえた: すてて 今の 絵を 読みなおす
        if (!had) status[m] = 'none';
        enqueue([m]);
        return;
      }
      if (kind === 'boy' && !atlasInfo) throw new Error('男の子の atlas.json を 読めません');
      const mi = sk ? skinA!.motions[m] : atlasInfo?.motions[m];
      const pal: PaletteRgb = sk ? [...curPalette, ...skinA!.extras] : curPalette;
      const a = indexImage(url, img, mi?.packed, mi?.frames, pal);
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
      // 前の 絵を おろす（入れかえ）
      const old = textures[m];
      if (old) {
        const oi = loadedInfo[m];
        if (oi) gpuBytes -= oi.width * oi.height;
        const od = old.image as { data: Uint8Array | null };
        if (od.data !== null) {
          cpuPending -= od.data.byteLength;
          od.data = null;
        }
        old.dispose();
      }
      loadedInfo[m] = { width: a.width, height: a.height, cols: a.cols, ...(a.packed ? { packed: a.packed } : {}) };
      textures[m] = tex;
      loadedSkin[m] = sk;
      gpuBytes += a.width * a.height;
      status[m] = 'ready';
      // 手に 持つ 絵で 上限(64 MiB)を こえる とき: 弓の組を おろす（弓を 持った とき また 読む）
      if (gpuBytes > GPU_LIMIT && sk) dropBow();
      // 始めて使うときの カクつきを防ぐ
      try {
        deps.initTexture?.(tex);
      } catch {
        /* 先に上げられなくても 使うときに上がる */
      }
    } catch (e) {
      if (g !== gen) return;
      if (!had) status[m] = 'failed';
      console.warn(`[char] ${m} の絵を読めませんでした。代わりの絵を使います`, e);
    }
  };

  // 読む順（1 まいずつ）。はじめの組 → 刀・弓の組
  const startBase = (): void => {
    const g = gen;
    // 同じステップの おわりには まだ 'none'（切りかえの 約束）。次の 順番から 始める
    chain = Promise.resolve().then(async () => {
      await Promise.all([loadMotion('idle', g), loadMotion('walk', g), atlasP]);
      // はしる・ジャンプは あとから（始めの読みこみを軽くする）
      await Promise.all([loadMotion('run', g), loadMotion('jump', g)]);
    });
  };
  const enqueue = (list: readonly SpriteMotion[]): void => {
    const g = gen;
    chain = chain.then(async () => {
      for (const m of list) {
        if (disposed || g !== gen) return;
        await loadMotion(m, g);
      }
    });
  };
  startAtlas();
  startBase();
  const requested = { katana: false, bow: false };
  let parryCell: ParryCell | null = null;
  let parryRequested = false;
  let lastWeapon: SpriteStepInput['weapon'] = 'none';
  const GLOW_MIX = 0.45;

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
    if (kind === 'boy') {
      // G0: パリィの あいだは たつ（わざの あいだは step が 入力を たつに している）
      if (parryCell) return { scene: 'stand', motion: 'idle', frame: machine.scene === 'stand' ? machine.frame : 0 };
    } else if (parryCell && ready(parryCell.motion)) return { scene: 'tech', motion: parryCell.motion, frame: parryCell.frame };
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

  /** WEAPON-9: 手に 持つ 絵の 差しかえ。読みこみずみの 刀の組は 新しい 絵で 入れかえる（足さない） */
  const setSkin = (next: string | null): void => {
    if (kind === 'boy' || next === wantSkin) return;
    wantSkin = next;
    if (!requested.katana) return; // これから 読む ときに wantSkin の 絵を 読む
    const redo = KATANA_MOTIONS.filter((m) => status[m] === 'ready' && loadedSkin[m] !== wantSkin);
    if (redo.length > 0) enqueue(redo);
  };

  const startWeaponLoads = (weapon: SpriteStepInput['weapon']): void => {
    if (kind === 'boy') return; // 男の子は 刀・弓の絵を 読まない（案 B）
    if (weapon === 'katana' && !requested.katana) {
      requested.katana = true;
      enqueue(KATANA_MOTIONS);
    } else if (weapon === 'bow' && !requested.bow) {
      requested.bow = true;
      enqueue(BOW_MOTIONS);
    }
  };

  // CHAR-5 案 B: 男の子は 刀・弓を 持っていても 素手と 同じ決まり。わざ・パリィの あいだは たつ（G0）
  const ZERO_V = { x: 0, y: 0, z: 0 };
  const scratch: SpriteStepInput = {
    position: ZERO_V,
    velocity: ZERO_V,
    onGround: true,
    inWater: false,
    running: false,
    facingDeg: 0,
    weapon: 'none',
    blade: null,
    bow: null,
  };
  const boyInput = (input: SpriteStepInput): SpriteStepInput => {
    const b = input.weapon === 'katana' ? input.blade : null;
    const tech = !!b && !!b.tech && (b.phase === 'startup' || b.phase === 'active' || b.phase === 'recovery');
    const still = tech || parryCell !== null;
    scratch.position = input.position;
    scratch.velocity = still ? ZERO_V : input.velocity;
    scratch.onGround = still ? true : input.onGround;
    scratch.inWater = still ? false : input.inWater;
    scratch.running = input.running;
    scratch.facingDeg = input.facingDeg;
    return scratch;
  };

  const transparentCell = (): Uint8ClampedArray => new Uint8ClampedArray(CELL * CELL * 4);

  return {
    step(input) {
      lastWeapon = input.weapon;
      if (input.weapon === 'katana') setSkin(input.weaponSkin ?? null);
      startWeaponLoads(input.weapon);
      // 手に 持つ 絵が 差しかわって いる 刀は 自分の 色を 持つので ぬりかえない
      setBladeColors(input.weapon === 'katana' && !wantSkin ? (input.bladeColors ?? null) : null);
      machine.step(kind === 'boy' ? boyInput(input) : input);
      lastRunning = input.running;
      facing = input.facingDeg;
      hurtAge = Math.min(hurtAge + 1, Number.MAX_SAFE_INTEGER);
    },
    render,
    preloadParry() {
      if (parryRequested || kind === 'boy') return; // 男の子は パリィの 絵を 読まない（案 B）
      parryRequested = true;
      enqueue(PARRY_MOTIONS);
    },
    setParry(cell) {
      parryCell = cell;
      // はじめて パリィを 出したとき 読む（刀を 持っただけでは 読まない。のこりの メモリが 少ないため）
      if (cell && !parryRequested) this.preloadParry();
    },
    setGlow(level) {
      uniforms.uMix!.value = Math.max(0, Math.min(1, level)) * GLOW_MIX;
    },
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
        bladeColors: bladeColors ? { ...bladeColors } : null,
        kind,
        skin: wantSkin,
        palette: curPalette.map((c) => [c[0], c[1], c[2]]),
      };
    },
    async readCell(motion, t, d, frame) {
      const out = transparentCell();
      try {
        const url = `${base}${motion}.png`;
        const [img] = await Promise.all([loadImage(url), atlasP]);
        const mi = atlasInfo?.motions[motion];
        const a = indexImage(url, img, mi?.packed, mi?.frames, curPalette);
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
          const c = curPalette[k - 1]!;
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
    setChar(next, basePath) {
      if (next === kind || disposed) return;
      gen++; // 前の キャラの 読みこみは ぜんぶ すてる
      kind = next;
      base = withSlash(basePath);
      for (const m of MOTIONS) {
        const tex = textures[m];
        if (tex) {
          const img = tex.image as { data: Uint8Array | null };
          if (img.data !== null) {
            cpuPending -= img.data.byteLength;
            img.data = null;
          }
          tex.dispose();
        }
        textures[m] = undefined;
        loadedInfo[m] = undefined;
        status[m] = 'none';
      }
      gpuBytes = 0;
      uniforms.uMap!.value = null;
      mesh.visible = false;
      curPalette = PALETTE_RGB;
      applyPalette();
      modelH = DEFAULT_MODEL_H;
      applySize();
      requested.katana = false;
      requested.bow = false;
      parryRequested = false;
      wantSkin = null;
      skinAtlases.clear();
      for (const m of MOTIONS) loadedSkin[m] = undefined;
      startAtlas();
      startBase();
      // 今 刀・弓・パリィを 持って(出して)いる 女の子なら はじめの組の あとに その組も 読む
      startWeaponLoads(lastWeapon);
      if (parryCell && kind === 'girl') this.preloadParry();
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
      gen++;
    },
  };
}
