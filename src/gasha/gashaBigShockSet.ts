/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)「こうげきの 当たり」「ひるみ」「止め・ゆれ」）: 手が 地面を たたいた ときの 当たり（BigShock）の 2 人分。
 * 人ごとに BigShock（gashaBigShock.ts）を 1 つずつ 持つ。式は BigShock の ものを そのまま 使う（コピーしない）。
 * 人は targets() を 毎ステップ 読んで ふやす・へらす（2P の さんか・やめるに ついて いく。やめた 人の ひるみ・ゆれ・当たりの 記録は その ステップで 消す）。
 * 場所で きまる 当たり（打撃・衝撃波の 輪・小さい 衝撃）は 2 人とも 見て、ダメージ・ひるみ・はじきは 当たった 人だけに 入る。
 */
import { BigShock, type Impact, type ImpactKind, type ShockHit } from './gashaBigShock';
import type { GashaTarget } from './gashaTargets';

type V3 = { x: number; y: number; z: number };

export interface ShockSetDeps {
  targets(): readonly GashaTarget[];
  groundY(x: number, z: number): number;
}

export interface ShockSet {
  /** 場所で きまる 当たり。2 人とも 見る。見た目用に 先頭の 人の 輪を 返す */
  add(kind: ImpactKind, x: number, y: number, z: number, facing?: { fx: number; fz: number }): Impact;
  /** 払う 腕に 当たった（その人に だけ）。当たったら true */
  sweepStrike(who: 1 | 2, from: V3, dx: number, dz: number): boolean;
  step(dt: number): void;
  clear(): void;
  inputBlocked(who: 1 | 2): boolean;
  staggerLeft(who: 1 | 2): number;
  shakeNow(who: 1 | 2): number;
  hits(who: 1 | 2): readonly ShockHit[];
  lastPush(who: 1 | 2): V3 | null;
  /** 経過 秒（ゆれの もよう） */
  readonly time: number;
  /** 生きて いる 輪の 数（先頭の 人の） */
  readonly impactCount: number;
}

interface Entry {
  shock: BigShock;
  /** 今の 人（毎ステップ 読みなおす） */
  t: GashaTarget;
  /** 一覧に いる 印（毎ステップの 数） */
  seen: number;
}

const NO_HITS: readonly ShockHit[] = [];
const FAR: V3 = { x: 1e9, y: 1e9, z: 1e9 };

export function createShockSet(d: ShockSetDeps): ShockSet {
  const entries = new Map<number, Entry>();
  let stamp = 0;
  let time = 0;
  /** 一覧に だれも いない ときの 見た目用（はるか 遠くの 人。だれにも 当たらない） */
  let ghost: BigShock | null = null;
  const entryFor = (t: GashaTarget): Entry => {
    let e = entries.get(t.who);
    if (!e) {
      const box = { e: null as Entry | null };
      const shock = new BigShock({
        player: () => box.e!.t.pos,
        groundY: d.groundY,
        hurt: (a, f) => (box.e!.t.hurt ? box.e!.t.hurt(a, f) : true),
        setPlayerVelocity: (v) => box.e!.t.setVelocity?.(v),
        knockbackMul: () => box.e!.t.knockbackMul?.() ?? 1,
        onGround: () => box.e!.t.body?.().onGround ?? true,
      });
      e = { shock, t, seen: 0 };
      box.e = e;
      entries.set(t.who, e);
    }
    return e;
  };
  /** 一覧を 読んで ふやす・へらす。先頭の 人の 入れものを 返す */
  const sync = (): Entry | null => {
    const list = d.targets();
    stamp++;
    let first: Entry | null = null;
    for (let i = 0; i < list.length; i++) {
      const e = entryFor(list[i]!);
      e.t = list[i]!;
      e.seen = stamp;
      first ??= e;
    }
    for (const [who, e] of entries) if (e.seen !== stamp) { e.shock.clear(); entries.delete(who); }
    return first;
  };
  const of = (who: number): BigShock | null => entries.get(who)?.shock ?? null;
  return {
    add(kind, x, y, z, facing) {
      const first = sync();
      let out: Impact | null = null;
      for (const e of entries.values()) {
        const imp = e.shock.add(kind, x, y, z, facing);
        if (e === first) out = imp;
      }
      if (out) return out;
      ghost ??= new BigShock({ player: () => FAR, groundY: d.groundY });
      return ghost.add(kind, x, y, z, facing);
    },
    sweepStrike(who, from, dx, dz) {
      sync();
      return of(who)?.sweepStrike(from, dx, dz) ?? false;
    },
    step(dt) {
      sync();
      time += dt;
      for (const e of entries.values()) e.shock.step(dt);
      ghost?.step(dt);
    },
    clear() {
      for (const e of entries.values()) e.shock.clear();
      ghost?.clear();
    },
    inputBlocked: (who) => of(who)?.inputBlocked() ?? false,
    staggerLeft: (who) => of(who)?.staggerLeft ?? 0,
    shakeNow: (who) => of(who)?.shakeNow ?? 0,
    hits: (who) => of(who)?.hits ?? NO_HITS,
    lastPush: (who) => of(who)?.lastPush ?? null,
    get time() { return time; },
    get impactCount() {
      for (const e of entries.values()) return e.shock.impacts.length;
      return ghost?.impacts.length ?? 0;
    },
  };
}
