import * as THREE from 'three';
import type { ItemId } from '../contracts';
import { AXE_HELD_PARTS } from './heldAxes';
import { BUG_HELD_PARTS, NET_HELD_PARTS } from './heldLive';

/**
 * 手に持つ道具・武器・M4 のアイテムの見た目（箱を組みあわせた小さな模型）。
 * 模型の向き: 原点がにぎった手。のびる向きは -Z（うでを前に上げると 上 になる）。X が横、Y が厚み。
 * 形と材料は全部の人形で使いまわす（userData.shared = true。dispose しない）。
 */

interface Part {
  /** 大きさ [X, Y, Z] と中心 [X, Y, Z] */
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  color: number;
  rotY?: number;
}

const WOOD = 0x7a5230;
const LIGHT_WOOD = 0xc9a066;
const STEEL = 0xe8eef5;
const GOLD = 0xe0b020;
const RED = 0xc0392b;
const DARK = 0x30343f;

/** 柄（にぎり）から先へ -Z にのびる棒 */
const stick = (len: number, thick: number, color: number, from = 0): Part => ({
  size: [thick, thick, len],
  pos: [0, 0, -(from + len / 2)],
  color,
});

function pickaxe(head: number): Part[] {
  return [
    stick(0.55, 0.05, WOOD, -0.1),
    { size: [0.42, 0.06, 0.09], pos: [0, 0, -0.5], color: head },
    { size: [0.06, 0.06, 0.13], pos: [-0.2, 0, -0.44], color: head },
    { size: [0.06, 0.06, 0.13], pos: [0.2, 0, -0.44], color: head },
  ];
}

function sword(bladeColor: number, handle: number, guard: number, core?: number): Part[] {
  const parts: Part[] = [
    { size: [0.06, 0.06, 0.2], pos: [0, 0, -0.0], color: handle },
    { size: [0.2, 0.05, 0.05], pos: [0, 0, -0.12], color: guard },
    { size: [0.025, 0.08, 0.62], pos: [0, 0, -0.45], color: bladeColor },
  ];
  if (core !== undefined) parts.push({ size: [0.03, 0.03, 0.56], pos: [0, 0, -0.45], color: core });
  return parts;
}

export const HELD_MODELS: Partial<Record<ItemId, Part[]>> = {
  wood_pickaxe: pickaxe(LIGHT_WOOD),
  stone_pickaxe: pickaxe(0x9a9a9a),
  iron_pickaxe: pickaxe(0xd8dde3),
  ...AXE_HELD_PARTS,
  // LIVE-1 版 3.2
  mushi_ami: NET_HELD_PARTS,
  mushi: BUG_HELD_PARTS,
  bokuto: [
    { size: [0.06, 0.06, 0.2], pos: [0, 0, 0], color: WOOD },
    { size: [0.14, 0.04, 0.04], pos: [0, 0, -0.12], color: WOOD },
    { size: [0.03, 0.09, 0.6], pos: [0, 0, -0.44], color: LIGHT_WOOD },
  ],
  katana: sword(STEEL, 0x2a2a3a, GOLD),
  crystal_katana: sword(0x9be8ff, 0x2a2a3a, 0xb28cff, 0xffffff),
  // WEAPON-7: 雷神剣（刃は むらさき 0xb070ff 系・芯は うすい むらさき・柄は こん色・つばは 金。そりは 箱では 作らない）
  raijin_ken: sword(0xb070ff, 0x24336e, GOLD, 0xe8d8ff),
  fujin_ken: sword(0xcfefff, 0x1d5a6e, 0x2b2b3a, 0xffffff),
  niji: sword(0xfff0f8, 0xb04a8a, 0x2b2b3a, 0xffffff),
  naginata: [
    stick(1.4, 0.05, WOOD, -0.25),
    { size: [0.04, 0.1, 0.42], pos: [0, 0, -1.35], color: STEEL },
    { size: [0.1, 0.1, 0.1], pos: [0, 0, -1.1], color: RED },
    { size: [0.08, 0.08, 0.08], pos: [0, 0, 0.3], color: GOLD },
  ],
  // ゆみ: 左手で持つ。たてにのびる（Z）。ふくらみは前（-Y）
  yumi: [
    { size: [0.05, 0.05, 0.16], pos: [0, -0.15, 0], color: DARK },
    { size: [0.04, 0.04, 0.22], pos: [0, -0.12, -0.19], color: WOOD },
    { size: [0.04, 0.04, 0.22], pos: [0, -0.12, 0.19], color: WOOD },
    { size: [0.04, 0.04, 0.2], pos: [0, -0.04, -0.38], color: WOOD },
    { size: [0.04, 0.04, 0.2], pos: [0, -0.04, 0.38], color: WOOD },
    { size: [0.012, 0.012, 0.8], pos: [0, 0.0, 0], color: 0xffffff },
  ],
  ya: [
    stick(0.6, 0.03, LIGHT_WOOD, 0),
    { size: [0.05, 0.05, 0.08], pos: [0, 0, -0.64], color: 0x888888 },
    { size: [0.1, 0.012, 0.08], pos: [0, 0, 0.0], color: 0xffffff },
    { size: [0.012, 0.1, 0.08], pos: [0, 0, 0.0], color: 0xffffff },
  ],
  iron_ingot: [
    { size: [0.2, 0.08, 0.12], pos: [0, 0, -0.08], color: 0xc8ccd2 },
    { size: [0.2, 0.02, 0.12], pos: [0, -0.05, -0.08], color: 0xeef0f3 },
  ],
  kabuto: [
    { size: [0.24, 0.24, 0.16], pos: [0, 0, -0.1], color: DARK },
    { size: [0.26, 0.26, 0.04], pos: [0, 0, -0.04], color: 0x4a4f5c },
    { size: [0.05, 0.05, 0.12], pos: [0, 0, -0.25], color: RED },
  ],
  yoroi: [
    { size: [0.26, 0.1, 0.26], pos: [0, 0, -0.12], color: DARK },
    { size: [0.06, 0.12, 0.26], pos: [0, 0, -0.12], color: RED },
    { size: [0.28, 0.04, 0.06], pos: [0, 0, -0.26], color: GOLD },
  ],
  kote: [
    { size: [0.14, 0.14, 0.2], pos: [0, 0, -0.14], color: DARK },
    { size: [0.16, 0.03, 0.22], pos: [0, 0, -0.14], color: RED },
    { size: [0.16, 0.03, 0.04], pos: [0, 0, -0.24], color: GOLD },
  ],
  suneate: [
    { size: [0.12, 0.12, 0.26], pos: [0, 0, -0.14], color: DARK },
    { size: [0.14, 0.03, 0.28], pos: [0, 0, -0.14], color: RED },
    { size: [0.14, 0.03, 0.04], pos: [0, 0, -0.26], color: GOLD },
  ],
  torch: [
    stick(0.38, 0.06, WOOD, -0.1),
    { size: [0.1, 0.1, 0.1], pos: [0, 0, -0.34], color: 0xff9a1f },
    { size: [0.06, 0.06, 0.08], pos: [0, 0, -0.4], color: 0xffe066 },
  ],
  lantern: [
    { size: [0.15, 0.15, 0.04], pos: [0, 0, -0.1], color: DARK },
    { size: [0.17, 0.17, 0.2], pos: [0, 0, -0.22], color: 0xe5483a },
    { size: [0.18, 0.18, 0.03], pos: [0, 0, -0.22], color: 0xffd966 },
    { size: [0.15, 0.15, 0.04], pos: [0, 0, -0.34], color: DARK },
  ],
  kite: [
    { size: [0.3, 0.02, 0.3], pos: [0, 0, -0.2], color: 0x4aa3ff, rotY: Math.PI / 4 },
    { size: [0.02, 0.025, 0.42], pos: [0, 0.015, -0.2], color: 0xffffff },
    { size: [0.05, 0.02, 0.05], pos: [0, 0, 0.08], color: 0xff5a6e },
    { size: [0.05, 0.02, 0.05], pos: [0, 0, 0.16], color: 0xffd966 },
  ],
  futon: [
    { size: [0.3, 0.1, 0.2], pos: [0, 0, -0.12], color: 0xf0a0b0 },
    { size: [0.3, 0.11, 0.05], pos: [0, 0, -0.12], color: 0xffffff },
  ],
  omamori: [
    { size: [0.11, 0.03, 0.17], pos: [0, 0, -0.1], color: 0xd0302a },
    { size: [0.04, 0.04, 0.05], pos: [0, 0, -0.2], color: GOLD },
    { size: [0.1, 0.035, 0.02], pos: [0, 0, -0.17], color: GOLD },
  ],
  waraji: [
    { size: [0.12, 0.04, 0.26], pos: [0, 0, -0.14], color: 0xd8b86a },
    { size: [0.13, 0.05, 0.03], pos: [0, 0, -0.18], color: RED },
  ],
  haniwa: [
    { size: [0.13, 0.13, 0.2], pos: [0, 0, -0.1], color: 0xc2663a },
    { size: [0.1, 0.1, 0.1], pos: [0, 0, -0.25], color: 0xc2663a },
    { size: [0.03, 0.02, 0.03], pos: [-0.025, -0.055, -0.26], color: 0x2a1a10 },
    { size: [0.03, 0.02, 0.03], pos: [0.025, -0.055, -0.26], color: 0x2a1a10 },
  ],
  // ---- M7（農業）
  kuwa: [
    stick(0.6, 0.05, WOOD, -0.1),
    { size: [0.05, 0.05, 0.1], pos: [0, 0, -0.62], color: 0x9e9e9e },
    { size: [0.2, 0.04, 0.05], pos: [0, 0, -0.66], color: 0x9e9e9e },
    { size: [0.04, 0.05, 0.1], pos: [0.1, 0, -0.62], color: 0x757575 },
  ],
  seed_onion: seedBag(0xf5f0dc),
  seed_tomato: seedBag(0xe53935),
  seed_pumpkin: seedBag(0xf57c00),
  seed_eggplant: seedBag(0x6a1b9a),
  // ---- M7-2（じょうろ: 青 / ながい じょうろ: みどり・そそぎ口 が ながい・はす口 が 金）
  watering_can: wateringCan(0x5c9bd5, 0x3f78b0, 0x2f5f8f, 0.3, 0xb0bec5),
  long_watering_can: wateringCan(0x4caf50, 0x2e7d32, 0x1b5e20, 0.5, 0xffd54f),
  // BUCKET-1: てつの バケツ（みず は 口の 上に 水色の 板）
  bucket: bucketParts(false),
  water_bucket: bucketParts(true),
  onion: [
    { size: [0.2, 0.2, 0.18], pos: [0, 0, -0.1], color: 0xf5f0dc },
    { size: [0.05, 0.05, 0.1], pos: [0, 0, -0.24], color: 0x43a047 },
  ],
  tomato: [
    { size: [0.2, 0.2, 0.2], pos: [0, 0, -0.1], color: 0xe53935 },
    { size: [0.08, 0.08, 0.03], pos: [0, 0, -0.22], color: 0x2e7d32 },
  ],
  pumpkin: [
    { size: [0.3, 0.3, 0.22], pos: [0, 0, -0.12], color: 0xf57c00 },
    { size: [0.06, 0.06, 0.05], pos: [0, 0, -0.26], color: 0x6d4c41 },
  ],
  eggplant: [
    { size: [0.12, 0.12, 0.32], pos: [0, 0, -0.18], color: 0x6a1b9a },
    { size: [0.07, 0.07, 0.05], pos: [0, 0, -0.36], color: 0x2e7d32 },
  ],
};

/** じょうろ: どう体 ＋ とって（上） ＋ そそぎ口（前 = -Z。`spout` が 長さ）＋ はす口 */
function wateringCan(body: number, shade: number, handle: number, spout: number, rose: number): Part[] {
  return [
    { size: [0.16, 0.16, 0.2], pos: [0, 0, -0.1], color: body },
    { size: [0.16, 0.04, 0.2], pos: [0, -0.1, -0.1], color: shade },
    { size: [0.04, 0.12, 0.1], pos: [0, 0.12, -0.04], color: handle },
    { size: [0.04, 0.04, 0.1], pos: [0, 0.18, -0.1], color: handle },
    { size: [0.04, 0.04, spout], pos: [0, 0.04, -0.2 - spout / 2], color: shade },
    { size: [0.08, 0.08, 0.04], pos: [0, 0.04, -0.2 - spout], color: rose },
  ];
}

/** バケツ: どう体 ＋ ふち ＋ とって（上の 弓）。water = 口に 水 */
function bucketParts(water: boolean): Part[] {
  const parts: Part[] = [
    { size: [0.16, 0.18, 0.16], pos: [0, 0, -0.1], color: 0xb0bec5 },
    { size: [0.18, 0.03, 0.18], pos: [0, 0.1, -0.1], color: 0x78909c },
    { size: [0.02, 0.1, 0.02], pos: [-0.08, 0.17, -0.1], color: 0x546e7a },
    { size: [0.02, 0.1, 0.02], pos: [0.08, 0.17, -0.1], color: 0x546e7a },
    { size: [0.18, 0.02, 0.02], pos: [0, 0.23, -0.1], color: 0x546e7a },
  ];
  if (water) parts.push({ size: [0.13, 0.02, 0.13], pos: [0, 0.095, -0.1], color: 0x4fc3f7 });
  return parts;
}

/**
 * じょうろ の かたむき（度。§3.2 (5)）。まく = 前 に 35° かたむけて 20 ステップ で もどす、くむ = 下 に 20°。
 * `age` = 動き 始めて から の ステップ。おわったら 0
 */
export function wateringTiltDeg(kind: 'pour' | 'fill', age: number): number {
  if (!(age >= 0) || age >= 20) return 0;
  return (kind === 'pour' ? 35 : 20) * (1 - age / 20);
}

/** たねの ふくろ（紙いろの 板に その やさいの色の 点） */
function seedBag(color: number): Part[] {
  return [
    { size: [0.2, 0.05, 0.26], pos: [0, 0, -0.14], color: 0xe8d3a0 },
    { size: [0.2, 0.06, 0.04], pos: [0, 0, -0.26], color: 0xc9ae78 },
    { size: [0.09, 0.07, 0.09], pos: [0, 0, -0.12], color },
  ];
}

/** 左手で持つ（ゆみ） */
export function isLeftHanded(item: ItemId): boolean {
  return item === 'yumi';
}

/** 模型があるか（ブロック・材料・ようかいだま以外の M4 のアイテム） */
export function hasHeldModel(item: ItemId): boolean {
  return HELD_MODELS[item] !== undefined;
}

const geometryCache = new Map<string, THREE.BoxGeometry>();
const materialCache = new Map<number, THREE.MeshBasicMaterial>();

function sharedGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w},${h},${d}`;
  let g = geometryCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geometryCache.set(key, g);
  }
  return g;
}
function sharedMaterial(color: number): THREE.MeshBasicMaterial {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    materialCache.set(color, m);
  }
  return m;
}

/** 模型を作る（なければ null）。形と材料は使いまわし。1 つの人形が 1 回だけ作ってとっておく */
export function buildHeldModel(item: ItemId): THREE.Group | null {
  const parts = HELD_MODELS[item];
  if (!parts) return null;
  const g = new THREE.Group();
  for (const p of parts) {
    const m = new THREE.Mesh(sharedGeometry(p.size[0], p.size[1], p.size[2]), sharedMaterial(p.color));
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.rotY) m.rotation.y = p.rotY;
    m.userData.shared = true;
    g.add(m);
  }
  return g;
}

// ---------------------------------------------------------------- WEAPON-2 しなる弓

export interface BendableBow {
  group: THREE.Group;
  /** bendDeg = 弓のまがり（度）、nock = つるをひく長さ（弓のなかの長さ。後ろが正） */
  setShape(bendDeg: number, nock: number): void;
}

const BOW_WOOD = 0x7a5230;
const BOW_STRING = 0xffffff;
const BOW_PIVOT_B = { y: -0.1, z: 0.3 } as const;
const BOW_TIP_REL = { y: 0.06, z: 0.18 } as const;

const rot = (a: number, y: number, z: number): [number, number] => [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];

/** 左手で持つ弓。まん中（にぎり）が原点、のびる向きは Z、ふくらみは -Y、つるは +Y 側 */
export function createBendableBow(): BendableBow {
  const g = new THREE.Group();
  const mk = (w: number, h: number, d: number, color: number, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(sharedGeometry(w, h, d), sharedMaterial(color));
    m.position.set(x, y, z);
    m.userData.shared = true;
    parent.add(m);
    return m;
  };
  // children[0] = にぎり（heldWorldPosition が読む）
  mk(0.05, 0.05, 0.16, DARK, g, 0, -0.15, 0);
  const halves: { a: THREE.Group; b: THREE.Group; s: number }[] = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    mk(0.04, 0.04, 0.22, BOW_WOOD, a, 0, -0.12, 0.19 * s);
    const b = new THREE.Group();
    b.position.set(0, BOW_PIVOT_B.y, BOW_PIVOT_B.z * s);
    mk(0.04, 0.04, 0.2, BOW_WOOD, b, 0, -0.04 - BOW_PIVOT_B.y, 0.38 * s - BOW_PIVOT_B.z * s);
    a.add(b);
    g.add(a);
    halves.push({ a, b, s });
  }
  const strings = [0, 1].map(() => {
    const m = new THREE.Mesh(sharedGeometry(0.012, 0.012, 1), sharedMaterial(BOW_STRING));
    m.userData.shared = true;
    g.add(m);
    return m;
  });
  const setShape = (bendDeg: number, nock: number): void => {
    const th = (bendDeg / 2) * (Math.PI / 180);
    for (let i = 0; i < 2; i++) {
      const { a, b, s } = halves[i]!;
      // z<0 側は +、z>0 側は - に回すと、はしが +Y（つる側）へたおれる
      a.rotation.x = -s * th;
      b.rotation.x = -s * th;
      const [py, pz] = rot(-s * th, BOW_PIVOT_B.y, BOW_PIVOT_B.z * s);
      const [ty, tz] = rot(-2 * s * th, BOW_TIP_REL.y, BOW_TIP_REL.z * s);
      const tipY = py + ty;
      const tipZ = pz + tz;
      const dy = nock - tipY;
      const dz = 0 - tipZ;
      const len = Math.hypot(dy, dz);
      const m = strings[i]!;
      m.scale.z = Math.max(len, 1e-4);
      m.position.set(0, (tipY + nock) / 2, tipZ / 2);
      m.rotation.x = Math.atan2(-dy, dz);
    }
  };
  setShape(0, 0);
  return { group: g, setShape };
}
