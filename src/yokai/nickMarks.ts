import * as THREE from 'three';
import { boxGeo, makePixelTexture } from './common';
import type { YokaiTitle } from '../contracts';

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

/** 頭の グループの中での 印の位置の めやす（箱の大きさ・高さ） */
interface HeadSpec {
  /** はちまき: 帯の中心の高さ・横と奥行き */
  bandY: number;
  bandW: number;
  bandD: number;
  /** かんむり: 台の下の高さ・横と奥行き */
  crownY: number;
  crownW: number;
  crownD: number;
  /** 印の中心の ずれ（頭の グループの 原点が 体の中心でないとき）。なければ 0 */
  z?: number;
  /** 印ぜんたいの 大きさの 倍率（大きな体に 合わせる）。なければ 1。ここの 数は 倍率で 割った 値で 書く */
  k?: number;
}
const HEADS: Record<string, HeadSpec> = {
  // かさの 2 段め（y 1.43）・てっぺん（y 1.6）
  karakasa: { bandY: 1.43, bandW: 0.74, bandD: 0.74, crownY: 1.6, crownW: 0.4, crownD: 0.4 },
  // ちょうちん: どうの 上（ふたの上・えの まわり。つり手の グループの 中心から見た高さ）
  chochin: { bandY: -0.27, bandW: 0.5, bandD: 0.5, crownY: -0.3, crownW: 0.44, crownD: 0.44 },
  // ろくろくび: 頭（0〜0.5）の おでこ・まげの 上
  rokurokubi: { bandY: 0.465, bandW: 0.55, bandD: 0.55, crownY: 0.7, crownW: 0.4, crownD: 0.4 },
  // ぬりかべ: かべ（はば 2.6・高さ 2.7・あつさ 0.8、かべの グループの 中で y 0〜2.7・z 0.4 が中心）。目の上（y 2.5）に帯、てっぺん（y 2.7）に かんむり
  nurikabe: { bandY: 1.25, bandW: 1.34, bandD: 0.44, crownY: 1.35, crownW: 0.45, crownD: 0.3, z: 0.4, k: 2 },
};

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
export function buildNickMarks(kind: string, title: YokaiTitle): NickMarks | null {
  const s = HEADS[kind];
  if (!s || (title !== 'taisho' && title !== 'nushi')) return null;
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
 * ヌシの 青い ひとだま（青い焔）。#270 の つづき（PROTOTYPE）。からだの まわりを 3 つ ゆっくり まわる。
 * ドット絵（12×16）を 十字の板（たて板 2 まい）に はる。ゆれ・まわりは 妖怪の clock（固定ステップの 積み）だけで 決める。
 */
export const NUSHI_FLAME = {
  count: 3,
  texW: 12,
  texH: 16, // FLAME_ROWS の 行数
  /** 1 周の 秒 */
  orbitPeriod: 12,
  /** うかぶ 上下の 周期（秒） */
  bobPeriod: 2.4,
  /** ゆらぎ（ひらべったく のびちぢみ）の 周期（秒） */
  swayPeriod: 1.7,
} as const;

// 外ぶち O（こい 青）・うえ a → した d（水色 → あかるい 水色）・渦 s
const FLAME_ROWS = [
  '....OO......',
  '...OaaO.....',
  '....OaaO....',
  '.....OaaO...',
  '.....OabO...',
  '....OabbO...',
  '...OabbbbO..',
  '..ObbbbbbbO.',
  '.ObbbbbbbbbO',
  'ObbbbOOObbbO',
  'ObbbOcccObbO',
  'ObbcOcOOcOdO',
  'ObcdOcOcOOdO',
  'OccdcOcccOdO',
  '.OddddOOOdO.',
  '..OOOOOOOO..',
];
/** ヌシ = 青、たいしょう = 赤（同じ形。ひと目で ちがいが わかる） */
export type FlameColor = 'blue' | 'red';
const FLAME_PALS: Record<FlameColor, Record<string, number>> = {
  blue: { O: 0x1a7fc0, a: 0x5bc0e0, b: 0x5ccbe8, c: 0x5fd9f0, d: 0x5fe8f5 },
  red: { O: 0xb01e1e, a: 0xe8452a, b: 0xf06a2a, c: 0xf89a30, d: 0xffd04a },
};
const flameTex: Partial<Record<FlameColor, THREE.DataTexture>> = {};
function flameTexture(c: FlameColor): THREE.DataTexture {
  return (flameTex[c] ??= makePixelTexture(FLAME_ROWS, FLAME_PALS[c]));
}
const flameGeo = new THREE.PlaneGeometry(1, 1);

/** ひとだま 1 つ = 十字（たて板 + 90°まわした たて板）。夜も 暗くしない・うしろを 書かない */
function createFlame(h: number, color: FlameColor): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: flameTexture(color), transparent: true, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide });
  mat.userData = { base: 0xffffff, skip: true };
  const w = (h * NUSHI_FLAME.texW) / NUSHI_FLAME.texH;
  for (const ry of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(flameGeo, mat);
    m.scale.set(w, h, 1);
    m.rotation.y = ry;
    m.renderOrder = 2;
    g.add(m);
  }
  return g;
}

/** からだの まわりを まわる 青い ひとだま 3 つ（グループ 1 つ。まわりは updateNushiFlames で）。 */
export function createNushiFlames(size: { width: number; height: number; depth: number }, color: FlameColor = 'blue'): THREE.Group {
  const root = new THREE.Group();
  root.name = 'nushiFlames';
  const fh = Math.max(0.4, Math.min(1.3, size.height * 0.42));
  root.userData = { radius: Math.max(size.width, size.depth) * 0.5 + fh * 0.7, height: size.height, fh };
  for (let i = 0; i < NUSHI_FLAME.count; i++) {
    const f = createFlame(fh, color);
    f.name = 'nushiFlame';
    root.add(f);
  }
  updateNushiFlames(root, 0);
  return root;
}

/** t 秒（固定ステップの 積み）の ひとだまの ならび。まわる・上下に うかぶ・ゆらぐ（点滅しない） */
export function updateNushiFlames(root: THREE.Group, t: number): void {
  const { radius, height, fh } = root.userData as { radius: number; height: number; fh: number };
  const n = root.children.length;
  root.children.forEach((f, i) => {
    const ph = (i / n) * Math.PI * 2;
    const a = (t / NUSHI_FLAME.orbitPeriod) * Math.PI * 2 + ph;
    const bob = Math.sin((t / NUSHI_FLAME.bobPeriod) * Math.PI * 2 + ph * 1.7);
    f.position.set(Math.cos(a) * radius, height * (0.62 + 0.14 * (i % 2)) + bob * height * 0.05, Math.sin(a) * radius);
    const sw = Math.sin((t / NUSHI_FLAME.swayPeriod) * Math.PI * 2 + ph * 2.3);
    f.scale.set(1 - 0.07 * sw, 1 + 0.1 * sw, 1 - 0.07 * sw);
    f.rotation.y = Math.sin(t * 1.3 + ph) * 0.25;
    f.position.y += fh * 0.1 * sw;
  });
}
