/** 時間の 倍率。2 人のとき もちもの画面でも ゆっくりに しない（§2.6・AC11）。base = `screen.timeScale()` の 値 */
export function duoTimeScale(base: number, joined: boolean): number {
  return joined ? 1 : base;
}

/** 2P が ボタンで 開こうと する 画面（§8・AC15）。段階 1 で 開けるのは 'inventory'（2P 自分の もちもの）だけ */
export type P2OpenKind = 'inventory' | 'book' | 'builder' | 'henhouse' | 'storage' | 'furnace';

/** 画面ごとに 2P が 開けるか（足し忘れは 型で 落とす） */
const P2_MAY_OPEN = {
  inventory: true,
  book: false,
  builder: false,
  henhouse: false,
  storage: false,
  furnace: false,
} as const satisfies Record<P2OpenKind, boolean>;

export const P2_OPEN_KINDS = Object.keys(P2_MAY_OPEN) as readonly P2OpenKind[];

export function p2MayOpen(kind: P2OpenKind): boolean {
  return P2_MAY_OPEN[kind];
}

/** こうげきを 受ける あいて */
export type HitTarget = { type: 'player'; who: 1 | 2 } | { type: 'yokai' } | { type: 'animal' };

/** こうげき（刀・弓・パンチ・火の玉の はね返し）が あいてに 当たるか。プレイヤー（自分も 仲間も）には 当たらない（AC37） */
export function hitsTarget(_attacker: 1 | 2, target: HitTarget): boolean {
  switch (target.type) {
    case 'player':
      return false;
    case 'yokai':
    case 'animal':
      return true;
    default: {
      const never: never = target;
      return never;
    }
  }
}

/** 落とし物を ひろえる 仲間: 倒れている 2P は ひろわない（自分の 袋も）。参加していなければ null（COOP-1 3a） */
export function pickableMate<T>(mate: T | null, down: boolean): T | null {
  return down ? null : mate;
}

/**
 * COOP-1 作業 3d（AC84）: 2P の 側に「ちょっと まってね」を 出すか。2 人の とき、世界が 止まっている あいだ（1P の 全面の もちもの画面・本・建築士さん）。
 * 型だけの スタブ（developer が 作る。テストは rules.test.ts）。
 */
export function duoWaitNotice(_i: { joined: boolean; inventoryOpen: boolean; modal: boolean }): boolean {
  throw new Error('COOP-1 3d: duoWaitNotice は まだ ない');
}
