import type { ScreenMode } from '../contracts';

/**
 * 1P の 全面の もちもの画面（'inventory'）の ときの 時間の 倍率。2 人の ときは 0（世界が 止まる。AC84）。1 人の ときは base の まま。
 * base = `screen.timeScale()` の 値。2P の パネルを 開いても 画面は 'inventory' に ならないので 倍率は 1 のまま（AC11）
 */
export function duoTimeScale(base: number, joined: boolean): number {
  return joined ? 0 : base;
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
 * 2P の 側に「ちょっと まってね」を 出すか（AC84）。2 人の とき、世界が 止まっている あいだ（1P の 全面の もちもの画面・本・建築士さん）。
 * joined = 2P が いる / inventoryOpen = 1P の 全面の もちもの画面 / modal = 本・建築士さんの 画面
 */
export function duoWaitNotice(i: { joined: boolean; inventoryOpen: boolean; modal: boolean }): boolean {
  return i.joined && (i.inventoryOpen || i.modal);
}

/** 2 人で 1P の 全面の もちもの画面（'inventory'）が 開いている あいだ 世界を 止めるか（AC84・§10）。`game.setModal` の `active()` が 使う */
export function duoWorldFrozen(i: { joined: boolean; mode: ScreenMode }): boolean {
  return i.joined && i.mode === 'inventory';
}
