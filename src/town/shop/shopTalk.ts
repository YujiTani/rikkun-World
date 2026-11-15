import type { Vec3 } from '../../contracts';

/**
 * よろずやさんに 話しかける 口（TOWN-1-shop §2.6 の 1）。右クリック（1P）・ZL（2P）の 「はなす」は 建築士さんと 同じ 道
 * （ほる係の `architects` の 口）を 通るので、その 口に よろずやさんの 当たりを まぜる。id は SHOP_TALK_ID（建築士さんの id と かさならない）。
 */
export const SHOP_TALK_ID = 'town:shop';

/** よろずやさんの 当たりの 箱（足もとから。はば の 半分・高さ。ブロック。建築士さんと 同じ 大きさ） */
const SHOPKEEPER_HIT = { hw: 0.45, h: 1.7 } as const;

export interface TalkPort {
  rayHit(origin: Vec3, dir: Vec3, reach: number): { id: string; distance: number } | null;
  talk(id: string): boolean;
  hit?(id: string): void;
}

export interface ShopTalk {
  /** よろずやさんの 足もと（街が なければ null） */
  at(): Vec3 | null;
  /** 話した（画面が 開けば true） */
  talk(who: 1 | 2): boolean;
}

/** 線分（origin から dir 向きに 0〜reach）と 1 つの 軸の 板の 重なり [t0, t1]（なければ null） */
function slab(o: number, d: number, lo: number, hi: number, t0: number, t1: number): [number, number] | null {
  if (Math.abs(d) < 1e-9) return o < lo || o > hi ? null : [t0, t1];
  let a = (lo - o) / d;
  let b = (hi - o) / d;
  if (a > b) [a, b] = [b, a];
  const s = Math.max(t0, a);
  const e = Math.min(t1, b);
  return s > e ? null : [s, e];
}

/** 目から の 線が reach いないで よろずやさんの 箱に 当たる きょり（当たらなければ null） */
export function shopkeeperRay(at: Vec3, origin: Vec3, dir: Vec3, reach: number): number | null {
  const { hw, h } = SHOPKEEPER_HIT;
  const tx = slab(origin.x, dir.x, at.x - hw, at.x + hw, 0, reach);
  if (!tx) return null;
  const ty = slab(origin.y, dir.y, at.y, at.y + h, tx[0], tx[1]);
  if (!ty) return null;
  const tz = slab(origin.z, dir.z, at.z - hw, at.z + hw, ty[0], ty[1]);
  return tz ? tz[0] : null;
}

/** 建築士さんの 口に よろずやさんを まぜる（近い ほうを ねらう）。who ＝ この 口を 使う 人 */
export function withShopTalk(base: TalkPort, shop: () => ShopTalk | null, who: 1 | 2): TalkPort {
  return {
    rayHit: (origin, dir, reach) => {
      const a = base.rayHit(origin, dir, reach);
      const at = shop()?.at() ?? null;
      const t = at ? shopkeeperRay(at, origin, dir, reach) : null;
      if (t === null || (a && a.distance <= t)) return a;
      return { id: SHOP_TALK_ID, distance: t };
    },
    talk: (id) => (id === SHOP_TALK_ID ? (shop()?.talk(who) ?? false) : base.talk(id)),
    hit: (id) => {
      if (id !== SHOP_TALK_ID) base.hit?.(id); // よろずやさんは たたいても 何も しない
    },
  };
}

/** よろずやの 窓（ほかの 係が 読む 口。wireShop が 作る。作る 前・街が ない ときは 何も しない） */
export interface ShopHub extends ShopTalk {
  /** その 人が よろずやの 画面を 開いて いる */
  openBy(who: 1 | 2): boolean;
  /** 1 人で 開いて いて 世界を 止める（本・建築士さんの メニューと 同じ） */
  frozen(): boolean;
  /** 世界を 止めて いる 間の 1 コマ（とじる しらべ・画面の 書きなおし） */
  tick(): void;
  /** パッドの メニューの 操作（'focusUp'〜'focusRight'・'confirm'・'closeMenu'） */
  pad(who: 1 | 2, action: string): void;
}

export const NO_SHOP: ShopHub = { at: () => null, talk: () => false, openBy: () => false, frozen: () => false, tick: () => {}, pad: () => {} };
