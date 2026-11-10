// COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c) ①・AC148）: ダンジョンの 宝箱。中身は あけた 人の もちもの。
// 宝箱の 窓口 `dig.chestPort.open(x, y, z, who)` の who は 1 = 1P・2 = 2P。`game/wire/mine.ts` が who に 合わせて 切りかえる。
// ふたの 動き・見せる 物・実績は 世界に 1 つ（who に よらない）。
import type { Inventory, ItemId, Vec3 } from '../contracts';

/** 宝箱の 中身を 入れる／あふれた 分を 落とす 手 */
export interface ChestHands {
  /** 入りきらない のこりを 返す */
  add(item: ItemId, count: number): number;
  /** その 人の 足もとに 落とし物を 出す */
  drop(item: ItemId, count: number): void;
}

export function createChestHands(d: {
  /** who 1 = 1P の もちもの・2 = 2P の もちもの（2P が いなければ null） */
  inventory(who: 1 | 2): Pick<Inventory, 'add'> | null;
  /** その 人の 足もと（いなければ null） */
  feet(who: 1 | 2): Vec3 | null;
  scatter(at: Vec3, item: ItemId, count: number): void;
}): (who: 1 | 2) => ChestHands {
  return (who) => {
    // 2P が いなければ 1P の 手に する（中身を なくさない）
    const w: 1 | 2 = who === 2 && d.inventory(2) !== null && d.feet(2) !== null ? 2 : 1;
    return {
      add: (item, count) => d.inventory(w)?.add(item, count) ?? count,
      drop: (item, count) => {
        const at = d.feet(w);
        if (at) d.scatter(at, item, count);
      },
    };
  };
}

export interface ChestRouter {
  /** fn の あいだだけ「あける 人」を who にする。おわったら（fn が 例外でも）1 に もどす */
  run(who: 1 | 2, fn: () => void): void;
  add(item: ItemId, count: number): number;
  drop(item: ItemId, count: number): void;
  /** 2P が あけた ときは 1P の ログ・画面に 出さない（2P の ログは 出さない。§13） */
  say(text: string): void;
  /** ふたが 動いて いる 宝箱の 本体の マス。2 人で 1 つ */
  readonly busy: Set<string>;
}

export function createChestRouter(d: { hands: (who: 1 | 2) => ChestHands; say(text: string): void }): ChestRouter {
  let who: 1 | 2 = 1;
  const busy = new Set<string>();
  return {
    run(w, fn) {
      who = w;
      try {
        fn();
      } finally {
        who = 1;
      }
    },
    add: (item, count) => d.hands(who).add(item, count),
    drop: (item, count) => d.hands(who).drop(item, count),
    say(text) {
      if (who === 1) d.say(text);
    },
    busy,
  };
}
