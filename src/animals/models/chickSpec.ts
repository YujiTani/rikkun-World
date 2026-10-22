import { COL, chickenSpec, type Part, type Prim, type V3 } from './chickenSpec';

/**
 * LIVE-2 の ひよこ（C1 だんご）・マッチョひよこ・マッチョにわとり の 形（DESIGN 16.12・16.13）。
 * 数は オーナーが OK した 試作（`livestockV3.ts` の `chickC1`・`machoF`・`machoA2`）と 同じ。単位は 1/16 ブロック。
 * 乱数なし。部品の 骨の 名前は 大人 の にわとり と そろえる（`CHICKEN_BONES`。ひよこ には 首・とさか・しっぽ が 無い）。
 */
const box = (a: V3, b: V3, col: number): Prim => ({ k: 'box', a, b, col });
const ell = (c: V3, r: V3, col: number, p?: number): Prim => ({ k: 'ell', c, r, col, p });
const mir = (p: Prim): Prim[] => {
  if (p.k === 'box') return [p, { ...p, a: [-p.b[0], p.a[1], p.a[2]], b: [-p.a[0], p.b[1], p.b[2]] }];
  if (p.k === 'ell') return [p, { ...p, c: [-p.c[0], p.c[1], p.c[2]] }];
  return [p];
};

/** ひよこ の 色（16.12） */
export const CHICK_COL = {
  /** たまご色（体） */
  body: 0xf2cf4e,
  /** こい たまご色（羽・うで・ねぐせ・しっぽ） */
  bodyD: 0xdcb33a,
  beak: 0xe8862e,
  leg: 0xe8962e,
  shell: 0xf5ecd8,
  shellD: 0xe2d6b8,
} as const;

/** 見た目 の 倍率（1/16 で 組んだ 形 に かける。DESIGN 16.12・16.13） */
export const CHICK_SCALE = 0.62;
export const MACHO_CHICK_SCALE = 0.72;
/** マッチョ の 大人 は ふつう の 1.15 倍（LIVE-2 §2.10） */
export const MACHO_ADULT_RATIO = 1.15;

/** 1 わ の 三角形 の 上限（リボン つき。DESIGN 16.12・16.13・16.17） */
export const CHICK_TRI_LIMIT = 360;
export const MACHO_CHICK_TRI_LIMIT = 440;
export const MACHO_ADULT_TRI_LIMIT = 900;

const legs = (h: number): Part[] => [
  { name: 'legL', pivot: [-1.5, h, 0], hideIn: ['body'], prims: [box([-2, 0, -1], [-1, h, 0], CHICK_COL.leg), box([-3, 0, -2], [-1, 1, 0], CHICK_COL.leg)] },
  { name: 'legR', pivot: [1.5, h, 0], hideIn: ['body'], prims: [box([1, 0, -1], [2, h, 0], CHICK_COL.leg), box([1, 0, -2], [3, 1, 0], CHICK_COL.leg)] },
];

/** 小さい リボン（体の 上。16.12: y 6.2・帯の 半径 2.6、結び目 右） */
function ribbonSmall(parent: string, y: number, z: number, r: number): Part {
  return {
    name: 'mark',
    parent,
    pivot: [0, y, z],
    hideIn: [parent],
    prims: [
      { k: 'ring', c: [0, y, z], ro: [r, 0.6, r], ri: r - 1.2, col: COL.ribbon },
      box([r - 0.5, y - 0.5, z - 0.5], [r + 1.5, y + 0.5, z + 0.5], COL.ribbonL),
      box([r + 0.5, y + 0.5, z - 1.5], [r + 1.5, y + 1.5, z - 0.5], COL.ribbon),
      box([r + 0.5, y + 0.5, z + 0.5], [r + 1.5, y + 1.5, z + 1.5], COL.ribbon),
    ],
  };
}

/** 太い まゆ（目の すぐ 上。こい むらさき。`head` の 子） */
function brow(x: number, y: number, z0: number, z1: number): Part {
  return { name: 'brow', parent: 'head', pivot: [0, y, z0], prims: mir(box([x, y, z0], [x + (z1 - z0 < 1 ? 2 : 1), y + 0.5, z1], COL.eye)) };
}

/** 力こぶ の うで（羽が うで に なる）。k = 左 −1／右 +1、肩 (k·sx, sy, z)、大きさ s。16.13 の 式 */
function flexArm(name: 'wingL' | 'wingR', k: number, sx: number, sy: number, z: number, s: number, col: number): Part {
  return {
    name,
    parent: 'body',
    pivot: [k * sx, sy, z],
    prims: [
      ell([k * (sx + 1.6 * s), sy, z], [1.9 * s, 1.2 * s, 1.4 * s], col, 2.3), // 二の腕
      ell([k * (sx + 2.0 * s), sy + 0.8 * s, z], [1.4 * s, 1.5 * s, 1.4 * s], col, 2.3), // 力こぶ
      ell([k * (sx + 3.3 * s), sy + 2.2 * s, z], [1.0 * s, 1.9 * s, 1.1 * s], col, 2.3), // 前腕（たて）
      ell([k * (sx + 3.3 * s), sy + 4.2 * s, z], [1.3 * s, 1.2 * s, 1.2 * s], col, 2.3), // こぶし
    ],
  };
}

/**
 * ひよこ（C1 だんご）。まるい 1 こ の たまご色 ＋ ねぐせ 2 本。頭と 体が ひとつ（首・とさか なし）。
 * `macho` = C1 の 体 ＋ 力こぶ の うで ＋ 太い まゆ（`machoF`）。
 */
export function chickSpec(mark: boolean, macho = false): Part[] {
  const g: Part[] = [
    { name: 'body', pivot: [0, 3, 0], prims: [ell([0, 4.2, 0], [3.2, 3.2, 3.3], CHICK_COL.body, 2.3), ell([0, 4.4, 3.2], [1.2, 1.1, 0.9], CHICK_COL.bodyD)] },
    ...legs(2),
    {
      name: 'head',
      parent: 'body',
      pivot: [0, 6, -1],
      prims: [
        box([-1, 4, -5], [1, 5, -3], CHICK_COL.beak),
        box([-1, 7, -1], [0, 9, 0], CHICK_COL.bodyD),
        box([0, 7, 0], [1, 8.5, 1], CHICK_COL.bodyD),
      ],
    },
    { name: 'eyes', parent: 'head', hideIn: ['body'], pivot: [0, 5.5, -2], prims: mir(box([1, 5, -3.5], [2, 6, -3], COL.eye)) },
  ];
  if (macho) {
    g.push(flexArm('wingL', -1, 2.9, 4.4, 0.5, 0.85, CHICK_COL.bodyD), flexArm('wingR', 1, 2.9, 4.4, 0.5, 0.85, CHICK_COL.bodyD));
    g.push(brow(1, 6.5, -3.6, -3));
  } else {
    g.push(
      { name: 'wingL', parent: 'body', pivot: [-3, 5.4, 0.3], prims: [ell([-3.1, 4.0, 0.5], [0.9, 1.6, 1.9], CHICK_COL.bodyD, 2.4)] },
      { name: 'wingR', parent: 'body', pivot: [3, 5.4, 0.3], prims: [ell([3.1, 4.0, 0.5], [0.9, 1.6, 1.9], CHICK_COL.bodyD, 2.4)] },
    );
  }
  if (mark) g.push(ribbonSmall('body', 6.2, -0.6, 2.6));
  return g;
}

/** マッチョ の 大人（A2 の 体・頭・とさか・しっぽ・リボン は そのまま。羽 だけ 力こぶ の うで に、太い まゆ を 足す）。16.13 */
export function machoSpec(mark: boolean): Part[] {
  const g = chickenSpec(mark);
  const swap = (name: string, p: Part): void => {
    const i = g.findIndex((q) => q.name === name);
    if (i >= 0) g[i] = p;
  };
  swap('wingL', flexArm('wingL', -1, 3.4, 6.4, 0.6, 1.25, COL.cream));
  swap('wingR', flexArm('wingR', 1, 3.4, 6.4, 0.6, 1.25, COL.cream));
  g.push(brow(2, 10.2, -4.6, -2.4));
  return g;
}
