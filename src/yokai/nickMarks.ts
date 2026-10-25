import * as THREE from 'three';
import { boxGeo, makePixelTexture } from './common';
import { yokaiHeads } from '../content/yokai/registry';
import type { HeadSpec } from '../content/yokai/types';
import type { YokaiKind, YokaiTitle } from '../contracts';

/**
 * 二つ名の 頭の印と、ヌシの ふんわり光（DESIGN 13.2、BALANCE §2.5）。
 *  - たいしょう = はちまき（きなり の帯 ＋ あい の結び目と はし 2 本）
 *  - ヌシ = かんむり（金・濃い金・とげ 5 本・水色の玉）＋ ふんわり光（からだを つつむ 光の箱 1 枚）
 * 印は 頭の グループの 子にする（首・かさ の動きに ついてくる）。おやぶん・なし は 印なし（ぬりかべ は かべの 上の方に はちまき、てっぺんに かんむり。#270）。
 */
export type NickMarkKind = 'hachimaki' | 'crown';

export interface NickMarks {
  group: THREE.Group;
  kind: NickMarkKind;
}

/** 頭の グループの中での 印の位置の めやす（箱の大きさ・高さ。値は content/yokai/<kind>.ts の head） */
const HEADS: Record<YokaiKind, HeadSpec> = yokaiHeads();

const KINARI = 0xfff6e0;
const AI = 0x3d5a9e;
const GOLD = 0xffd23f;
const GOLD_DEEP = 0xd9a520;
const ORB = 0x5fd3ff;

function box(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
  const m = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  g.add(m);
}

/** 頭の印。おやぶん・二つ名なし は null。顔は 前（-Z）なので 結び目は うしろ（+Z） */
export function buildNickMarks(kind: YokaiKind, title: YokaiTitle): NickMarks | null {
  const s = HEADS[kind];
  if (title !== 'taisho' && title !== 'nushi') return null;
  const group = new THREE.Group();
  group.name = 'nickMarks';
  group.position.z = s.z ?? 0;
  if (s.k) group.scale.setScalar(s.k);
  if (title === 'taisho') {
    const h = 0.08;
    box(group, s.bandW, h, s.bandD, 0, s.bandY, 0, KINARI);
    const z = s.bandD / 2 + 0.03;
    box(group, 0.1, 0.1, 0.06, 0, s.bandY, z, AI);
    box(group, 0.04, 0.22, 0.03, -0.05, s.bandY - 0.14, z + 0.04, AI);
    box(group, 0.04, 0.22, 0.03, 0.05, s.bandY - 0.16, z + 0.05, AI);
    return { group, kind: 'hachimaki' };
  }
  const { crownW: w, crownD: d, crownY: y } = s;
  box(group, w, 0.08, d, 0, y + 0.04, 0, GOLD);
  box(group, w + 0.02, 0.04, d + 0.02, 0, y + 0.02, 0, GOLD_DEEP);
  const top = y + 0.08;
  // かどの とげ 4 本 ＋ 前の 高い とげ 1 本
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(group, 0.07, 0.12, 0.07, (sx * (w - 0.07)) / 2, top + 0.06, (sz * (d - 0.07)) / 2, GOLD);
  box(group, 0.08, 0.2, 0.08, 0, top + 0.1, -(d - 0.08) / 2, GOLD);
  // 前に 水色の玉
  box(group, 0.08, 0.08, 0.05, 0, y + 0.04, -d / 2 - 0.03, ORB);
  return { group, kind: 'crown' };
}

/**
 * ヌシ（青）・たいしょう（赤）の ひとだま（PROTOTYPE v2）。頭の 左右に 1 つずつ（高さは ちがう）。
 * ドット絵は 6 コマ（しっぽが 左右に ゆれ、からだが 少し ふくらむ）を 約 9 コマ/秒で まわす。
 * ゆれ・ういては 妖怪の clock（固定ステップの 積み）だけで 決める。1 つ = 十字（たて板 2 まい）。
 */
export const NUSHI_FLAME = {
  count: 2,
  texW: 14,
  texH: 20,
  frames: 6,
  /** 1 秒に すすむ コマの数 */
  fps: 9,
  /** うかぶ 上下の 周期（秒） */
  bobPeriod: 2.6,
} as const;

/** ヌシ = 青、たいしょう = 赤（同じ形。ひと目で ちがいが わかる） */
export type FlameColor = 'blue' | 'red';
// O 外ぶち・a 上 → d 下（あかるく）
const FLAME_PALS: Record<FlameColor, Record<string, number>> = {
  blue: { O: 0x1a7fc0, a: 0x5bc0e0, b: 0x5ccbe8, c: 0x5fd9f0, d: 0x5fe8f5 },
  red: { O: 0xb01e1e, a: 0xe8452a, b: 0xf06a2a, c: 0xf89a30, d: 0xffd04a },
};
// 渦（からだの 下の まきこみ）の 外ぶち 色の マス（x, y）
const SWIRL: readonly (readonly [number, number])[] = [
  [5, 13], [6, 13], [7, 13], [8, 13],
  [4, 14], [9, 14],
  [4, 15], [6, 15], [7, 15], [9, 15],
  [4, 16], [6, 16], [9, 16],
  [5, 17], [6, 17], [7, 17], [8, 17],
];

/** ひとだまの ドット絵 1 コマ。細い しっぽが 左右に ゆれる（上ほど 大きく）。しるしは サンプル画像（ほそ長い・うねる しっぽ・下に 渦） */
export function flameRows(frame: number): string[] {
  const W = NUSHI_FLAME.texW;
  const H = NUSHI_FLAME.texH;
  const ph = (frame / NUSHI_FLAME.frames) * Math.PI * 2;
  const breath = 0.45 * Math.sin(ph);
  const g: string[][] = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  const fillCh = (y: number) => (y < 7 ? 'a' : y < 11 ? 'b' : y < 15 ? 'c' : 'd');
  for (let y = 1; y <= 18; y++) {
    let hw: number;
    let c = 7;
    if (y <= 10) {
      const t = (y - 1) / 9; // 0 = 先、1 = くびれの 下
      hw = 0.55 + 1.9 * t * t;
      const k = Math.pow(1 - t, 1.3);
      c += 2.2 * k * Math.sin(ph + y * 0.55) + 1.0 * (1 - t) * (1 - t);
    } else {
      const yc = 14.8;
      const ry = 4.4;
      const dy = (y - yc) / ry;
      hw = (5.0 + breath) * Math.sqrt(Math.max(0, 1 - dy * dy));
      hw = Math.max(hw, y === 11 ? 2.4 : 0);
    }
    for (let x = 0; x < W; x++) if (Math.abs(x + 0.5 - c) <= hw) g[y]![x] = fillCh(y);
  }
  for (const [x, y] of SWIRL) if (g[y]![x] !== '.') g[y]![x] = 'O';
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (g[y]![x] !== '.') continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g[y! + dy!]?.[x! + dx!] ?? '.') !== '.' && g[y! + dy!]![x! + dx!] !== 'O');
      if (n) out[y]![x] = 'O';
    }
  return out.map((r) => r.join(''));
}

const flameTex: Partial<Record<string, THREE.DataTexture>> = {};
function flameTexture(c: FlameColor, frame: number): THREE.DataTexture {
  const k = `${c}${frame}`;
  return (flameTex[k] ??= makePixelTexture(flameRows(frame), FLAME_PALS[c]));
}
const flameGeo = new THREE.PlaneGeometry(1, 1);

/** ひとだま 1 つ = 十字（たて板 + 90°まわした たて板。ぜんたいを 45°まわして、どの 向きからも 細く 見えすぎない）。夜も 暗くしない */
function createFlame(h: number, color: FlameColor): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: flameTexture(color, 0), transparent: true, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide });
  mat.userData = { base: 0xffffff, skip: true };
  const w = (h * NUSHI_FLAME.texW * 1.2) / NUSHI_FLAME.texH;
  for (const ry of [Math.PI / 4, -Math.PI / 4]) {
    const m = new THREE.Mesh(flameGeo, mat);
    m.scale.set(w, h, 1);
    m.rotation.y = ry;
    m.renderOrder = 2;
    g.add(m);
  }
  g.userData = { mat, color };
  return g;
}

/** 頭の 左右の ひとだま 2 つ（左が 高い）。ぐるぐる まわらない。うごきは updateNushiFlames で */
export function createNushiFlames(size: { width: number; height: number; depth: number }, color: FlameColor = 'blue'): THREE.Group {
  const root = new THREE.Group();
  root.name = 'nushiFlames';
  const fh = Math.max(0.45, Math.min(1.4, size.height * 0.5));
  const side = size.width * 0.5 + fh * 0.45;
  root.userData = { height: size.height, fh, side };
  for (let i = 0; i < NUSHI_FLAME.count; i++) {
    const f = createFlame(fh, color);
    f.name = 'nushiFlame';
    root.add(f);
  }
  updateNushiFlames(root, 0);
  return root;
}

/** t 秒（固定ステップの 積み）の ようす。コマを まわし、少し 上下に うかぶ（点滅しない） */
export function updateNushiFlames(root: THREE.Group, t: number): void {
  const { height, fh, side } = root.userData as { height: number; fh: number; side: number };
  root.children.forEach((f, i) => {
    const left = i === 0;
    const bob = Math.sin((t / NUSHI_FLAME.bobPeriod) * Math.PI * 2 + i * 2.1);
    f.position.set(left ? -side : side, height * (left ? 0.88 : 0.68) + bob * fh * 0.08, 0);
    const frame = (Math.floor(t * NUSHI_FLAME.fps) + i * 3) % NUSHI_FLAME.frames;
    const { mat, color } = f.userData as { mat: THREE.MeshBasicMaterial; color: FlameColor };
    mat.map = flameTexture(color, frame);
  });
}
