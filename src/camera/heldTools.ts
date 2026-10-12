import * as THREE from 'three';
import type { ItemId } from '../contracts';

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
  bokuto: [
    { size: [0.06, 0.06, 0.2], pos: [0, 0, 0], color: WOOD },
    { size: [0.14, 0.04, 0.04], pos: [0, 0, -0.12], color: WOOD },
    { size: [0.03, 0.09, 0.6], pos: [0, 0, -0.44], color: LIGHT_WOOD },
  ],
  katana: sword(STEEL, 0x2a2a3a, GOLD),
  crystal_katana: sword(0x9be8ff, 0x2a2a3a, 0xb28cff, 0xffffff),
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
};

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
