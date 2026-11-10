// COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c)・AC132・AC150）: 2P の 出来事を 実績へ わたす 中身。
// 実績は 2 人で 共有（同じ AchievementSystem に 1 回ずつ）。2P の ログは 出さない（§13）。
// `game/wire/duoPlay.ts` は ここを 呼ぶ 行だけ。1P の step.ts・ui.ts も 同じ 関数を 使う（式の コピーを 作らない）。
import type { AchievementSystem } from '../achievements/AchievementSystem';
import { CROP_KINDS, SEED_ITEM } from '../contracts';
import type { BladeEvent, BowEvent, CombatEvent, DigEvent, ItemId, Vec3, WearEvent } from '../contracts';

export type P2FeedSink = Pick<AchievementSystem, 'feedDig' | 'feedCombat' | 'feedBlade' | 'feedArrow' | 'feedWear'>;

export interface P2Feed {
  /** 2P の ほる係の 出来事の とり出し口を 包む。呼ばれる たびに、とり出した 出来事を feedDig に 1 回わたして 同じ 配列を 返す（空なら feedDig は 呼ばない） */
  tapDig(drain: () => DigEvent[]): () => DigEvent[];
  combat(events: readonly CombatEvent[]): void;
  blade(events: readonly BladeEvent[]): void;
  arrows(events: readonly BowEvent[]): void;
  wear(events: readonly WearEvent[]): void;
}

/** 矢を うった／当てた を 数える（1P の step.ts と 2P で 同じ 関数）。noArrow・pickup は 数えない */
export function feedArrowEvents(sink: Pick<AchievementSystem, 'feedArrow'>, events: readonly BowEvent[]): void {
  for (const e of events) {
    if (e.type === 'arrowShot') sink.feedArrow('shot');
    else if (e.type === 'arrowHit') sink.feedArrow('hit');
  }
}

export function createP2Feed(sink: P2FeedSink): P2Feed {
  return {
    tapDig(drain) {
      return () => {
        const ev = drain();
        if (ev.length > 0) sink.feedDig(ev);
        return ev;
      };
    },
    combat(events) {
      if (events.length > 0) sink.feedCombat(events);
    },
    blade(events) {
      if (events.length > 0) sink.feedBlade(events, 2);
    },
    arrows(events) {
      feedArrowEvents(sink, events);
    },
    wear(events) {
      if (events.length > 0) sink.feedWear(events);
    },
  };
}

/** 落とし物を ひろった ときの 知らせ（アイテム id, 数, 妖怪の おとしものか） */
export type DropPicked = (item: ItemId, count: number, fromYokai: boolean) => void;

/**
 * 落とし物を ひろった ときの 知らせ（1P の ui.ts と 2P で 同じ 中身）。順番: ① 妖怪の おとしものの たね → noteSeedFound ② notifyPickup ③ extra（1P は ホットバーの ぽん）
 */
export function createDropPicked(d: {
  notifyPickup(item: ItemId, count: number): void;
  noteSeedFound(item: ItemId, at: Vec3): void;
  position(): Vec3;
  extra?: DropPicked;
}): DropPicked {
  return (item, count, fromYokai) => {
    if (fromYokai && CROP_KINDS.some((k) => SEED_ITEM[k] === item)) d.noteSeedFound(item, d.position());
    d.notifyPickup(item, count);
    d.extra?.(item, count, fromYokai);
  };
}

/** who 1 は p1・who 2 は p2 に 1 回ずつ */
export function routeDropPicked(d: { p1: DropPicked; p2: DropPicked }): (item: ItemId, count: number, fromYokai: boolean, who: 1 | 2) => void {
  return (item, count, fromYokai, who) => (who === 1 ? d.p1 : d.p2)(item, count, fromYokai);
}
