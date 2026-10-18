/**
 * LIVE-1 にわとり の 形の データ（アート A2「おもち」。`docs/art/DESIGN.md` 16 章）。
 * 形 = 白い おもち 2 つ（体・頭）＋ かくれた 首。単位は 1/16 ブロック の 小キューブ。
 * ここは 「形の 書き方」だけ（Three.js なし）。小キューブ → 面を つなぐ → 1 メッシュ は `voxelMesh.ts`。
 */
export type V3 = [number, number, number];

export type Prim =
  /** 少し 四角に よった まる（p = 2.2〜2.6） */
  | { k: 'ell'; c: V3; r: V3; col: number; p?: number }
  | { k: 'box'; a: V3; b: V3; col: number; paint?: boolean }
  /** わ（首の リボン）。ro = そとの 半径、ri = 中の あな の 半径（水平） */
  | { k: 'ring'; c: V3; ro: V3; ri: number; col: number };

export interface Part {
  name: string;
  parent?: string;
  /** 骨の 位置（1/16 ブロック。体の 原点から） */
  pivot: V3;
  prims: Prim[];
  /** この部品の 面のうち、ここに 書いた 部品の 中に うまる 面は 作らない（動いても 見えない 所だけ） */
  hideIn?: string[];
}

/** 1 小キューブ = 1/16 ブロック */
export const V = 1 / 16;

/** 色の 表（DESIGN 16.4。白 8 割・赤と だいだい が 少し） */
export const COL = {
  W: 0xf5f1e6,
  cream: 0xebe4d4,
  red: 0xe8553d,
  beak: 0xf2b33d,
  leg: 0xe8962e,
  eye: 0x2e2438,
  ribbon: 0x3d5a9e,
  ribbonL: 0x5b7bc4,
  /** ねらい中の ふちどり */
  outline: 0x7fe0ff,
} as const;

/** にわとり 1 わ の 三角形の 上限（しるし 込み。LIVE-1 §3.2・DESIGN 16.8） */
export const CHICKEN_TRI_LIMIT = 600;
/** 高さ 0.81 → 0.80 に そろえる 倍率 */
export const CHICKEN_SCALE = 0.985;

/** 骨の 並び（しるし の `mark` は 最後。なかまで ない にわとり は `mark` を 作らない） */
export const CHICKEN_BONES = ['body', 'legL', 'legR', 'neck', 'head', 'comb', 'eyes', 'wingL', 'wingR', 'tail', 'mark'] as const;
export type ChickenBone = (typeof CHICKEN_BONES)[number];

const box = (a: V3, b: V3, col: number): Prim => ({ k: 'box', a, b, col });
const ell = (c: V3, r: V3, col: number, p?: number): Prim => ({ k: 'ell', c, r, col, p });

/** 左右 そろえて 作る ための 鏡うつし（x を 反転） */
function mirror(p: Prim): Prim {
  if (p.k === 'ell' || p.k === 'ring') return { ...p, c: [-p.c[0], p.c[1], p.c[2]] };
  return { ...p, a: [-p.b[0], p.a[1], p.a[2]], b: [-p.a[0], p.b[1], p.b[2]] };
}
const both = (...ps: Prim[]): Prim[] => ps.flatMap((p) => [p, mirror(p)]);

/** なかまの しるし: 首の リボン（帯 ＋ 体の 右 に 出る 結び目）。帯は 1 段、結び目は 箱 5 つ */
function ribbon(parent: string, c: V3, r: [number, number], side: number): Part {
  const [, ny, nz] = c;
  const k = side;
  return {
    name: 'mark',
    parent,
    pivot: c,
    hideIn: [parent, 'neck'],
    prims: [
      { k: 'ring', c, ro: [r[0], 0.6, r[1]], ri: Math.min(r[0], r[1]) - 1.4, col: COL.ribbon },
      box([k, ny - 0.5, nz - 0.5], [k + 2, ny + 0.5, nz + 0.5], COL.ribbonL),
      box([k + 1, ny + 0.5, nz - 2.5], [k + 2, ny + 2.5, nz - 0.5], COL.ribbon),
      box([k + 1, ny + 0.5, nz + 0.5], [k + 2, ny + 2.5, nz + 2.5], COL.ribbon),
      box([k + 1, ny - 2.5, nz - 1.5], [k + 2, ny - 0.5, nz - 0.5], COL.ribbon),
      box([k + 1, ny - 3.5, nz + 0.5], [k + 2, ny - 0.5, nz + 1.5], COL.ribbon),
    ],
  };
}

/**
 * にわとり の 部品（骨 1 本 ずつ）。前 = −z、上 = +y、右 = +x。
 *  - 体 = まるい おもち 1 こ。頭 = 小さい おもち 1 こ を 体の 前・上 に のせ、境目 に くびれ（あごの 下の 段）を 作る。
 *  - 首（neck）= 頭と 体の 間 に かくれた 小さな まる。頭が 前・上 に 出ると 首が 半分 だけ ついてきて のびて 見える。
 */
export function chickenSpec(mark: boolean): Part[] {
  const W = COL.W;
  const g: Part[] = [
    { name: 'body', pivot: [0, 3, 0.5], prims: [ell([0, 5.4, 0.8], [3.8, 3.0, 4.5], W, 2.3)] },
    { name: 'legL', pivot: [-1.5, 3, 0], hideIn: ['body'], prims: [box([-2, 0, -1], [-1, 3, 0], COL.leg), box([-3, 0, -3], [0, 1, 0], COL.leg)] },
    { name: 'legR', pivot: [1.5, 3, 0], hideIn: ['body'], prims: [box([1, 0, -1], [2, 3, 0], COL.leg), box([0, 0, -3], [3, 1, 0], COL.leg)] },
    { name: 'neck', parent: 'body', pivot: [0, 7.0, -1.6], prims: [ell([0, 7.2, -2.4], [1.9, 1.6, 1.9], W, 2.4)] },
    {
      name: 'head',
      parent: 'neck',
      pivot: [0, 7.8, -2.8],
      prims: [
        ell([0, 9.0, -3.0], [2.4, 2.4, 2.6], W, 2.2),
        box([-1, 8, -7], [1, 9, -5], COL.beak),
        box([-1, 6, -6], [1, 8, -5], COL.red),
      ],
    },
    {
      name: 'comb',
      parent: 'head',
      hideIn: ['head'],
      pivot: [0, 10.6, -2.8],
      prims: [
        box([-1, 10, -5], [1, 12, -4], COL.red),
        box([-1, 10, -4], [1, 13, -3], COL.red),
        box([-1, 10, -3], [1, 12, -2], COL.red),
        box([-1, 10, -2], [1, 13, -1], COL.red),
        box([-1, 10, -1], [1, 11.5, 0], COL.red),
      ],
    },
    { name: 'eyes', parent: 'head', hideIn: ['head'], pivot: [0, 9, -3], prims: both(box([2, 8, -4], [3, 10, -3], COL.eye)) },
    { name: 'wingL', parent: 'body', pivot: [-3.8, 7.0, 0], prims: [ell([-4, 5.2, 1.0], [1.3, 2.3, 3.0], COL.cream, 2.5)] },
    { name: 'wingR', parent: 'body', pivot: [3.8, 7.0, 0], prims: [ell([4, 5.2, 1.0], [1.3, 2.3, 3.0], COL.cream, 2.5)] },
    { name: 'tail', parent: 'body', pivot: [0, 6, 3.8], prims: [ell([0, 8.6, 5.0], [2.0, 3.2, 1.5], W, 2.5)] },
  ];
  if (mark) g.push(ribbon('body', [0, 7.0, -1.9], [3.2, 3.2], 3));
  return g;
}
