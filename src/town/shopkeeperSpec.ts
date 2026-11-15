import { cachedModel } from '../animals/models/voxelMesh';
import type { Part, Prim, V3 } from '../animals/models/chickenSpec';

/**
 * よろずやさん（TOWN-1 1C）の 形・色。見本 `town/art/v5/yorozuya.png` の 店の 中の 人（白い かみ・むらさきの きもの）を
 * 建築士さんと 同じ 小キューブ（1/16 ブロック）で 組んだ 仮の 形【オーナー確認】。前 ＝ −z、足もとの まん中 ＝ 原点。動かない ので 骨は 1 本。
 */
const SHOPKEEPER_COL = {
  kimono: 0x7a3f86, // むらさきの きもの
  kimonoD: 0x5c2c66, // すその 線
  obi: 0xe9c46a, // 帯（からし色）
  eri: 0xf4efe2, // えり
  skin: 0xf0c49a,
  hair: 0xf2f0ea, // 白い かみ
  geta: 0x6b4a2e,
  eye: 0x2e2438,
  mouth: 0x9a5034,
  cheek: 0xf2a08a,
} as const;

const box = (a: V3, b: V3, col: number, paint?: boolean): Prim => ({ k: 'box', a, b, col, paint });
const ell = (c: V3, r: V3, col: number, p?: number): Prim => ({ k: 'ell', c, r, col, p });

/** 三角形の 上限（建築士さんと 同じ 目安） */
export const SHOPKEEPER_TRI_LIMIT = 600;

function shopkeeperSpec(): Part[] {
  const K = SHOPKEEPER_COL;
  return [
    {
      name: 'body',
      pivot: [0, 0, 0],
      prims: [
        // きもの（すそが 少し ひろい）・帯・えり
        box([-5, 0, -3], [5, 3, 3], K.geta),
        box([-5, 2, -3.2], [5, 3, 3.2], K.kimonoD),
        box([-4.8, 3, -3], [4.8, 9, 3], K.kimono),
        box([-4.6, 9, -2.8], [4.6, 15, 2.8], K.kimono),
        box([-4.8, 9, -3], [4.8, 11, 3], K.obi),
        box([-1.6, 11, -3], [1.6, 15, -2.6], K.eri),
        // うで（そで）と 手（前で 組む）
        box([-7, 9.5, -2], [-4.6, 15, 2], K.kimono),
        box([4.6, 9.5, -2], [7, 15, 2], K.kimono),
        box([-3, 9.5, -4.2], [3, 11.5, -2.8], K.skin),
        // あたま・白い かみ・おだんご
        ell([0, 19.5, 0], [4.2, 4.3, 4], K.skin, 4),
        ell([0, 20.8, 0.8], [4.5, 3.9, 3.8], K.hair, 4),
        box([-4.3, 22, -4.3], [4.3, 23.6, -2.6], K.hair),
        ell([0, 25, 1], [2.2, 1.8, 2.2], K.hair, 3),
        // 目・口・ほお（顔に ぬる）
        box([-2.6, 18.4, -4], [-1.6, 19.4, -3], K.eye, true),
        box([1.6, 18.4, -4], [2.6, 19.4, -3], K.eye, true),
        box([-1, 16.4, -4], [1, 17, -3], K.mouth, true),
        box([-3.6, 17, -4], [-2.6, 17.8, -3], K.cheek, true),
        box([2.6, 17, -4], [3.6, 17.8, -3], K.cheek, true),
      ],
    },
  ];
}

/** 形を 1 回だけ 組む */
export const shopkeeperModel = () => cachedModel('shopkeeper', shopkeeperSpec);
