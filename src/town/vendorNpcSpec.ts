import { cachedModel } from '../animals/models/voxelMesh';
import type { Part, Prim, V3 } from '../animals/models/chickenSpec';

/**
 * TOWN-1 1E の 街の 人（かじやさん・だんごやさん・ごはんやさん・やたいさん）の 形と 色。よろずやさん（shopkeeperSpec.ts）と 同じ
 * 小キューブ（1/16 ブロック）で 組んだ 仮の 形【オーナー確認】。前 ＝ −z、足もとの まん中 ＝ 原点。動かない ので 骨は 1 本（描画 1 回）。
 * かじやさんの つちを もつ うで だけ 別の 形（`smithArmModel`。かたの 点 SMITH_SHOULDER で ふる）。
 */

const box = (a: V3, b: V3, col: number, paint?: boolean): Prim => ({ k: 'box', a, b, col, paint });
const ell = (c: V3, r: V3, col: number, p?: number): Prim => ({ k: 'ell', c, r, col, p });

/** 三角形の 上限（よろずやさんと 同じ 目安） */
export const VENDOR_TRI_LIMIT = 600;

interface Look {
  /** きもの・はっぴ */
  cloth: number;
  clothD: number;
  /** 帯・まえかけ */
  belt: number;
  /** まえかけ（なければ null） */
  apron: number | null;
  skin: number;
  hair: number;
  /** はちまき・ずきん（なければ null） */
  band: number | null;
  /** 左の うで（かじやさんは みじかい そで） */
  sleeve: number;
}

const EYE = 0x2e2438;
const MOUTH = 0x9a5034;
const CHEEK = 0xf2a08a;
const GETA = 0x6b4a2e;

/** 体（両うで つき。noRightArm ＝ 右うでを 別の 形に する） */
function person(L: Look, noRightArm = false): Prim[] {
  const p: Prim[] = [
    box([-5, 0, -3], [5, 3, 3], GETA),
    box([-5, 2, -3.2], [5, 3, 3.2], L.clothD),
    box([-4.8, 3, -3], [4.8, 9, 3], L.cloth),
    box([-4.6, 9, -2.8], [4.6, 15, 2.8], L.cloth),
    box([-4.8, 9, -3], [4.8, 10.5, 3], L.belt),
    box([-7, 9.5, -2], [-4.6, 15, 2], L.sleeve),
    box([-7, 8, -1.6], [-4.8, 9.5, 1.6], L.skin),
    ell([0, 19.5, 0], [4.2, 4.3, 4], L.skin, 4),
    ell([0, 20.8, 0.8], [4.5, 3.9, 3.8], L.hair, 4),
    box([-4.3, 22, -4.3], [4.3, 23.6, -2.6], L.hair),
    box([-2.6, 18.4, -4], [-1.6, 19.4, -3], EYE, true),
    box([1.6, 18.4, -4], [2.6, 19.4, -3], EYE, true),
    box([-1, 16.4, -4], [1, 17, -3], MOUTH, true),
    box([-3.6, 17, -4], [-2.6, 17.8, -3], CHEEK, true),
    box([2.6, 17, -4], [3.6, 17.8, -3], CHEEK, true),
  ];
  if (L.apron !== null) p.push(box([-3.6, 3.5, -3.4], [3.6, 10.5, -2.9], L.apron));
  if (L.band !== null) p.push(box([-4.6, 21.6, -4.5], [4.6, 22.8, 4.4], L.band));
  if (!noRightArm) p.push(box([4.6, 9.5, -2], [7, 15, 2], L.sleeve), box([4.8, 8, -1.6], [7, 9.5, 1.6], L.skin));
  return p;
}

const LOOKS = {
  /** かじやさん: こげ茶の 革の まえかけ・白い はちまき・みじかい そで（うでは はだ） */
  smith: { cloth: 0x5a4a3c, clothD: 0x3e3329, belt: 0x2c2420, apron: 0x7a4b2a, skin: 0xe2a978, hair: 0x2b2522, band: 0xf2efe6, sleeve: 0xe2a978 },
  /** だんごやさん: もも色の きもの・白い まえかけ・赤い ずきん */
  dango: { cloth: 0xe7849a, clothD: 0xc26176, belt: 0xd84a3a, apron: 0xf6f2e8, skin: 0xf0c49a, hair: 0x3a2a24, band: 0xd8443a, sleeve: 0xe7849a },
  /** ごはんやさん: あい色の はっぴ・白い はちまき・白い まえかけ */
  gohan: { cloth: 0x2f4f8f, clothD: 0x223a6a, belt: 0xf2efe6, apron: 0xf6f2e8, skin: 0xf0c49a, hair: 0x2b2522, band: 0xf2efe6, sleeve: 0x2f4f8f },
  /** やたいさん（かいとり）: きいろと みどりの はっぴ・みどりの はちまき */
  stall: { cloth: 0xe8b830, clothD: 0xb98e1c, belt: 0x3f8f4a, apron: null, skin: 0xf0c49a, hair: 0x4a3426, band: 0x3f8f4a, sleeve: 0x3f8f4a },
} as const satisfies Record<'smith' | 'dango' | 'gohan' | 'stall', Look>;

export type VendorLook = keyof typeof LOOKS;

/** かじやさんの 右の かた（つちを ふる 点。1/16 ブロック） */
export const SMITH_SHOULDER: V3 = [5.8, 14, 0];

function bodySpec(k: VendorLook): Part[] {
  return [{ name: 'body', pivot: [0, 0, 0], prims: person(LOOKS[k], k === 'smith') }];
}

/** かじやさんの 右うでと つち（かたの 点の まわりで 前に ふりおろす） */
function smithArmSpec(): Part[] {
  const L = LOOKS.smith;
  return [
    {
      name: 'arm',
      pivot: [0, 0, 0],
      prims: [
        box([4.6, 9.5, -2], [7, 15, 2], L.skin),
        box([4.8, 8, -1.6], [7, 9.5, 1.6], L.skin),
        // つちの え（手から 前へ）と あたま（黒い 鉄）
        box([5.2, 8.2, -9], [6.6, 9.4, -1], 0x8a6236),
        box([4.4, 7, -12], [7.4, 10.6, -8.6], 0x3a3a40),
      ],
    },
  ];
}

/** 形を 1 回だけ 組む */
export const vendorModel = (k: VendorLook) => cachedModel(`vendor:${k}`, () => bodySpec(k));
export const smithArmModel = () => cachedModel('vendor:smith:arm', smithArmSpec);
