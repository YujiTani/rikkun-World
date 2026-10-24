import type { BlockId, Vec3 } from '../contracts';

/**
 * #293 試作: 大きい がしゃどくろの 体の 上に ブロックを 置く・こわす 口（ワールドの ブロックでは なく、体の 関節に ついて 動く）。
 * つなぎは src/proto/gashaBigPlaced.ts。DigSystem は ワールドの ねらいと くらべて 近い 方を ねらう。
 */
export interface BodyAim {
  /** ねらった 体の マス（世界の マスの 座標） */
  cell: Vec3;
  /** 面の 外向き（各成分 −1・0・1） */
  face: Vec3;
  /** 置く マス */
  place: Vec3;
  /** 目から 面までの きょり */
  distance: number;
  /** 置いた ブロックなら その ブロック（ガラスの 雲の マスは 'leaves' の かわり。ほる はやさの もと）。体の 本体の 固い マスなら null */
  placed: BlockId | null;
  /** ガラスの 雲の マス（ほると 割れる。アイテムは 出ない。時間で 生えなおす） */
  glass?: boolean;
}

export interface BodyBlocksPort {
  /** 目 o から 向き d の 線で 体（本体・置いた ブロック）の 固い マスを ねらう。reach いない。なければ null */
  aim(o: Vec3, d: Vec3, reach: number): BodyAim | null;
  /** 置ける ブロック・マスか（上限・すでに ある・体の 中でない） */
  canPlace(cell: Vec3, block: BlockId): boolean;
  /** 置く（いちばん ちかい 部位に くっつく）。置けたら true */
  place(cell: Vec3, block: BlockId): boolean;
  /** こわす（置いた ブロック・ガラスの 雲の マス）。置いた ブロックなら こわした ブロックを 返す（ガラスは null） */
  remove(cell: Vec3): BlockId | null;
  /** そのマスが 体の 固い マス（本体・雲・置いた ブロック）か。足もとの 丸い 影の 高さを きめる */
  solid(x: number, y: number, z: number): boolean;
  /** 足もとの 真下の 体の 上の 面の 高さ（体の 本体・ガラスの 雲・置いた ブロックの いちばん 近い 上面）。足の 高さ + 1 より 下に なければ null。丸い 影の 高さ */
  surfaceBelow(x: number, y: number, z: number): number | null;
  /** 体に 置ける ブロックの 種類か（手に 持った もの の 判定） */
  accepts(block: BlockId): boolean;
}
