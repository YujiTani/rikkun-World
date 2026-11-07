import { DUO_TUNING } from './tuning';

/**
 * 1P の もちもの画面（'inventory'）の ときの 時間の 倍率。2 人の ときは 1（世界は 止めない・ゆっくりにも しない。もう 1 人が 遊んでいる。AC11・AC75）。
 * 1 人の ときは base の まま（全面は 0.25 倍）。base = `screen.timeScale()` の 値
 */
export function duoTimeScale(base: number, joined: boolean): number {
  return joined ? 1 : base;
}

/** 2P が ボタンで 開こうと する 画面（§8・AC15・AC95）。開けるのは 'inventory'（2P 自分の もちもの）と、4c から 'storage'（たんす）・'furnace'（かまど）。本・建築士さん・とりごやは 段階 3 まで 開かない */
export type P2OpenKind = 'inventory' | 'book' | 'builder' | 'henhouse' | 'storage' | 'furnace';

/** 画面ごとに 2P が 開けるか（足し忘れは 型で 落とす） */
const P2_MAY_OPEN = {
  inventory: true,
  book: false,
  builder: false,
  henhouse: false,
  storage: true, // 4c: たんすを ねらって Y か ZL
  furnace: true, // 4c: かまどを ねらって ZL
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
 * 2P の 側に「ちょっと まってね」を 出すか。2 人の とき、世界が 止まっている あいだ（本・建築士さん）。
 * もちもの画面（1P の 2 人用・2P の 2 人用）は 世界を 止めない ので 出さない（4a。AC75）。
 * joined = 2P が いる / modal = 本・建築士さんの 画面
 */
export function duoWaitNotice(i: { joined: boolean; modal: boolean }): boolean {
  return i.joined && i.modal;
}

/**
 * 全面の 光の 道（`Game.setWorldPass` の `worldPass`。画面ぜんたいを 1 人の 絵に する）を 使うか（COOP-1 4d-0・AC98。不具合 ①）。
 * 1 人の とき: 雷か 虹が 出ている あいだ（今の 決まり）。2 人の とき: いつも false（2P の 半分が 消えるので、いつも 左右 `viewPass`）
 */
export function worldPassActive(i: { thunder: boolean; rainbow: boolean; joined: boolean }): boolean {
  return !i.joined && (i.thunder || i.rainbow);
}

/**
 * 1P の カメラの ふだんの きょり（COOP-1 4d-2・AC104）。2 人の ときは その きょり（`shared.duoCamDistance`＝5.0）、1 人の ときは 1P ひとりの きょり。
 * 1P の シャイニングの もどり先（combat.ts の LegendDeps.baseDistance）と 1P の カメラの 口（player.ts の camFx1）が 同じ この 関数を 使う
 */
export function baseCamDistance(duoCamDistance: number | null): number {
  return duoCamDistance ?? DUO_TUNING.cameraSolo;
}

/** その人の 物を えらぶ（COOP-1 4d-2 の `shared.legendFor(who)`・`duo.legend(who)`）。1P は いつも one、2P は 参加して いれば two・いなければ null */
export function pickLegend<T>(who: 1 | 2, joined: boolean, one: T, two: T | null): T | null {
  return who === 1 ? one : joined ? two : null;
}
