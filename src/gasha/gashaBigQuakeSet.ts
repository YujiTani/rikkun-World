/**
 * COOP-1 4d-3: アースクエイクの ゆれを 人ごとに（のっている 人だけ 横に ゆさぶる。ジャンプ中の 人は 押されない）。
 * 式は BodyQuake（gashaBigQuake.ts）の ものを そのまま 使う。人は targets() を 毎ステップ 読んで ふやす・へらす。
 */
import { BodyQuake } from './gashaBigQuake';
import { TUNE as T } from './gashaBigTuning';
import type { GashaTarget } from './gashaTargets';

export interface QuakeSetDeps {
  targets(): readonly GashaTarget[];
  /** その人が 体の 上に のっているか */
  isRider(t: GashaTarget): boolean;
  /** 押しが はじまった（効果音の 用） */
  onPush?(): void;
}

export interface QuakeSet {
  /** ゆれを はじめる（打撃の コマ） */
  start(): void;
  stop(): void;
  step(dt: number): void;
  /** ゆれの のこり（秒） */
  readonly left: number;
  readonly active: boolean;
}

interface Slot { q: BodyQuake; t: GashaTarget; seen: number }

export function createQuakeSet(d: QuakeSetDeps): QuakeSet {
  const slots = new Map<number, Slot>();
  let stamp = 0;
  let left = 0;
  const sync = (): void => {
    const list = d.targets();
    stamp++;
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      let s = slots.get(t.who);
      if (!s) {
        const box = { s: null as Slot | null };
        const q = new BodyQuake({
          isRider: () => d.isRider(box.s!.t),
          onGround: () => box.s!.t.body?.().onGround ?? true,
          nudge: (dx, dz) => box.s!.t.nudge?.(dx, dz),
          onPush: d.onPush,
        }, T.slam2.quake.seed + (t.who - 1)); // 1P の 順は 今の まま。2P は ずらして 同じ 向きに ならない ように
        s = { q, t, seen: 0 };
        box.s = s;
        slots.set(t.who, s);
      }
      s.t = t;
      s.seen = stamp;
    }
    for (const [who, s] of slots) if (s.seen !== stamp) { s.q.stop(); slots.delete(who); }
  };
  return {
    start() { sync(); left = 0; for (const s of slots.values()) { s.q.start(); left = Math.max(left, s.q.left); } },
    stop() { for (const s of slots.values()) s.q.stop(); left = 0; },
    step(dt) {
      sync();
      left = 0;
      for (const s of slots.values()) { s.q.step(dt); left = Math.max(left, s.q.left); }
    },
    get left() { return left; },
    get active() { return left > 0; },
  };
}
