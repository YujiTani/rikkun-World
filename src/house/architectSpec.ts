import { cachedModel } from '../animals/models/voxelMesh';
import type { Part, Prim, V3 } from '../animals/models/chickenSpec';

/**
 * 建築士さん（案 A「はっぴの だいくさん」）の 形・色・うなずきの 数（HOUSE-1A）。
 * 数の 元は docs/art/house-1/proto/houseA.ts.txt（オーナー OK 済み・見た目は かえない）。単位は 1/16 ブロック の 小キューブ。前 = −z、足もとの まん中 = 原点。
 * DOM・three なし（形を 組むのは `architectModel()`）。
 */


/** 色の 表（DESIGN 19.3） */
export const ARCH_COL = {
  ai: 0x2f4780, // あい（はっぴ）
  aiL: 0x3d5a9e, // すその 線
  eri: 0xefe7d4, // えり・せなかの しるし
  skin: 0xf0c49a,
  hair: 0x3a2a22,
  pants: 0x3a3f52, // ももひき
  tabi: 0x2a2a30, // 地下足袋
  obi: 0xa87b4f, // 帯
  wood: 0x9c7040, // 木づちの 柄
  woodL: 0xc89a62, // 木づちの 頭
  band: 0x5a3a22, // 木づちの 頭の 帯
  eye: 0x2e2438, // 目（どうぶつと 同じ）
  mouth: 0x9a5034,
  hachi: 0xf4f0e6, // はちまき
  outline: 0x7fe0ff, // ねらい中の ふちどり（どうぶつと 同じ。妖怪の 黄と 分ける）
} as const;

const box = (a: V3, b: V3, col: number, paint?: boolean): Prim => ({ k: 'box', a, b, col, paint });
const ell = (c: V3, r: V3, col: number, p?: number): Prim => ({ k: 'ell', c, r, col, p });

/** 骨の 並び。`buildModel(architectSpec())` で 三角形 514・ふちどり 430（見本で はかった 数） */
export function architectSpec(): Part[] {
  const K = ARCH_COL;
  return [
    { name: 'body', pivot: [0, 7, 0], prims: [
      box([-4.5, 7, -2.5], [4.5, 15, 2.5], K.ai),
      box([-5, 7, -3], [5, 9, 3], K.ai),
      box([-4.6, 9, -2.6], [4.6, 10.5, 2.6], K.obi),
      box([-3, 10.5, -2.8], [-1, 15, -2.4], K.eri),
      box([1, 10.5, -2.8], [3, 15, -2.4], K.eri),
      box([-4.6, 7, -3.1], [4.6, 7.8, 3.1], K.aiL),
      // せなかの しるし（白い 四角 の まん中 に 藍 = 「回」の 形）
      box([-2, 10.5, 2.4], [2, 14.5, 2.9], K.eri),
      box([-1, 11.5, 2.4], [1, 13.5, 3.0], K.ai),
    ] },
    { name: 'legL', pivot: [-2, 7, 0], prims: [box([-4, 1.5, -1.5], [-0.5, 7, 1.5], K.pants), box([-4, 0, -2.5], [-0.5, 1.5, 1.5], K.tabi)] },
    { name: 'legR', pivot: [2, 7, 0], prims: [box([0.5, 1.5, -1.5], [4, 7, 1.5], K.pants), box([0.5, 0, -2.5], [4, 1.5, 1.5], K.tabi)] },
    { name: 'armL', parent: 'body', pivot: [-5.5, 14, 0], hideIn: ['body'], prims: [box([-7, 9.5, -1.5], [-4.5, 15, 1.5], K.ai), box([-6.8, 8, -1.2], [-4.7, 9.5, 1.2], K.skin)] },
    { name: 'armR', parent: 'body', pivot: [5.5, 14, 0], hideIn: ['body'], prims: [box([4.5, 9.5, -1.5], [7, 15, 1.5], K.ai), box([4.7, 8, -1.2], [6.8, 9.5, 1.2], K.skin)] },
    { name: 'tool', parent: 'armR', pivot: [5.8, 9, 0], prims: [
      // 木づち: 手から かたの 上を 通って せなかへ（ARCH_TOOL_REST の 向きで。前から T、横から せなかに 頭）
      box([5.2, 8, -0.6], [6.4, 22, 0.6], K.wood),
      box([2.5, 21, -2.4], [11, 25.5, 2.4], K.woodL),
      box([2.3, 20.9, -2.6], [3.3, 25.6, 2.6], K.band),
      box([10.2, 20.9, -2.6], [11.2, 25.6, 2.6], K.band),
    ] },
    { name: 'head', parent: 'body', pivot: [0, 15, 0], hideIn: ['body'], prims: [
      ell([0, 19.5, 0], [4.2, 4.3, 4], K.skin, 4),
      ell([0, 20.6, 0.7], [4.5, 4, 3.9], K.hair, 4),
      box([-4.3, 22, -4.3], [4.3, 24, -2.5], K.hair),
      { k: 'ring', c: [0, 21.8, 0.2], ro: [4.9, 0.8, 4.7], ri: 3.4, col: K.hachi },
      box([-1, 21, 4.4], [1, 22.6, 5.4], K.hachi),
      box([0.4, 19.4, 4.8], [1.4, 21, 5.6], K.hachi),
      box([-1.6, 19.6, 4.8], [-0.6, 21, 5.6], K.hachi),
      // 目・口 は 顔に ぬる（paint。顔から 出さない）
      box([-2.6, 18, -4], [-1.6, 20, -3], K.eye, true),
      box([1.6, 18, -4], [2.6, 20, -3], K.eye, true),
      box([-1, 16.2, -4], [1, 17, -3], K.mouth, true),
    ] },
  ];
}

/** 木づちの 待機の 向き（度）。骨 `tool` に いつも かける（x = うしろへ ねかせる、z = 外へ） */
export const ARCH_TOOL_REST = { x: 28, z: -10 } as const;

// ------------------------------------------------------------ うなずき（DESIGN 19.5。1 コマ = 1 ステップ = 1/60 秒）
export const NOD_FRAMES = 20; // 頭。体は 2 コマ おくれて 22 で おわる

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/** f コマ目（0〜22）の 角度（度）。head = 頭の 前への かたむき（＋ = 下を 向く）、roll = 頭の 横の かしげ、body = 体の 前への かたむき */
export function nodPose(f: number): { head: number; roll: number; body: number } {
  const keys: Array<[number, number]> = [[0, 0], [4, -9], [8, 26], [12, 26], [20, 0]];
  let head = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0] = keys[i];
    const [f1, v1] = keys[i + 1];
    if (f >= f0 && f <= f1) {
      const t = (f - f0) / (f1 - f0);
      head = v0 + (v1 - v0) * (i === 1 ? t * t : ease(t)); // 下げる 区間は 加速（こくっ）、ほかは なめらか
    }
  }
  // 体は 2 コマ おくれて 小さく ついていく（MOTION #13: 1 つの 軸・同じ タイミング に しない）
  const g = Math.max(0, f - 2);
  let body = 0;
  if (g > 4 && g <= 8) body = 6 * ease((g - 4) / 4);
  else if (g > 8 && g <= 12) body = 6;
  else if (g > 12 && g <= 20) body = 6 * (1 - ease((g - 12) / 8));
  return { head, roll: head * 0.18, body };
}

/** 三角形の 上限（にわとりと 同じ 目安。見本で 514・ふちどり 430） */
export const ARCHITECT_TRI_LIMIT = 600;

/** 形を 1 回だけ 組む（体・ふちどり・骨）。ゲームの 建築士さんは ぜんぶ これを 使う */
export const architectModel = () => cachedModel('architect', architectSpec);
