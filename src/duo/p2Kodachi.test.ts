import { describe, expect, it } from 'vitest';
import type { ArmorSlot, BladeEvent, CombatEvent, ItemId, Vec3, YokaiWorld } from '../contracts';
import { Kodachi } from '../combat/Kodachi';
import { NINJA_GEAR, SAMURAI_GEAR } from '../craft/config';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { drainSounds } from '../fx/soundLog';
import { bindWho } from './credit';
import { createP2Kodachi } from './p2Kodachi';

/**
 * COOP-1 作業 4b（docs/design/COOP-1.md 1.10 §3.5・AC91）の 先行テスト（赤）。忍びの 手甲を 着た 2P の パンチ・刀の わざが 当たると、
 * 1P と 同じ おくれ・ダメージで 小太刀の 追い打ち。1P の 追い打ちとは **別に 数える**（待ちの 列も 上限も 別）。
 * 追い打ちの 部品は 1P と 同じ `Kodachi`（src/combat/Kodachi.ts。式・おくれ・ダメージは 調整表 NINJA_TUNING）。2P 用に コピーしない。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Kodachi.ts   createP2Kodachi(d: P2KodachiDeps): P2Kodachi
 *     P2KodachiDeps = {
 *       armor: { equipped(slot: ArmorSlot): ItemId | null };   // p2.armor（1P の そうびは 見ない）
 *       yokai: YokaiWorld;                                    // 妖怪の 本体（YokaiManager。1P の Kodachi に わたす 物と 同じ）。中で `bindWho(yokai, 2)` して 2P の 当てたことに する
 *       playerPos: () => Vec3;                                // 2P の 足もと（追い打ちの 向きの めやす）。配線は `() => ctl.state.position` を そのまま 返し、コピーを 作らない（毎ステップ 新しい 物を 作らない）
 *       sound: Pick<SoundFx, 'playTones'>;                    // 追い打ちが 出たら `playKodachi(sound)`（1P と 同じ 音）
 *       tick?: () => number;
 *       onFire?: (info: { yokaiId: number | null; part: string | null; damage: number }) => void;   // 絵（1P の kodachiFx を 使いまわす）
 *     }
 *     P2Kodachi = {
 *       step(): void;                                  // 毎ステップ。**先に** step()、あとで そのステップの 出来事を combat()・blade() に 入れる（当てた ステップを 0 に する ため。1P と 同じ 順）
 *       combat(events: readonly CombatEvent[]): void;  // 2P の combat.drainEvents()。punchHit だけ 聞く
 *       blade(events: readonly BladeEvent[]): void;    // 2P の blade.drainEvents()。techHit だけ 聞く
 *       drainEvents(): KodachiHitEvent[];              // kodachiHit。毎ステップ 取り出す（たまり続けない）
 *       pending(): number;
 *       clear(): void;                                 // セーブ読みこみ・世界の きりかえ・参加／やめる
 *     }
 *     中は `new Kodachi({ armor, yokai: bindWho(yokai, 2), playerPos, tick, onFire })` 1 つ（1P の Kodachi とは 別の 入れもの）。
 *   配線: wire/duoPlay.ts の Live に 1 つ。step() の 先頭で `l.kodachi.step()`、`l.sounds.combat(...)` の 前後で `l.kodachi.combat(events)`・`l.kodachi.blade(events)`、
 *     `l.kodachi.drainEvents()` も 毎ステップ。onFire の 絵は 2P の 斬撃（kodachiFx に 2P の 位置・向き）。
 */

const DELAY = Math.max(1, Math.floor(NINJA_TUNING.tekkoDelayTicks));
const FROM: Vec3 = { x: 2.5, y: 9, z: 6.5 };

interface Call {
  id: number;
  amount: number;
  knock: unknown;
  by: unknown;
  who: unknown;
}

/** 妖怪の 本体の にせもの（damage の 引数を ぜんぶ 記録）。体力は へらさない */
function fakeYokai(ids: number[]) {
  const calls: Call[] = [];
  const y = {
    list: () => ids.map((id) => ({ id, state: 'chase' })),
    raycast: () => null,
    damage: (id: number, amount: number, _from: Vec3, knock: unknown, by: unknown, who: unknown) => {
      calls.push({ id, amount, knock, by, who });
      return amount;
    },
    occupies: () => false,
    drainEvents: () => [],
  } as unknown as YokaiWorld;
  return { y, calls };
}

const wearing = (arms: ItemId | null) => ({ equipped: (slot: ArmorSlot): ItemId | null => (slot === 'arms' ? arms : null) });
const punchHit = (yokaiId: number): CombatEvent => ({ type: 'punchHit', tick: 0, yokaiId, damage: 1 }) as CombatEvent;
const techHit = (yokaiId: number): BladeEvent => ({ type: 'techHit', tick: 0, yokaiId, tech: 'thrust', damage: 3, position: FROM }) as unknown as BladeEvent;
const sound = { playTones: () => undefined } as never;

function rig(arms2: ItemId | null = NINJA_GEAR.arms, ids = [1, 2, 3]) {
  const { y, calls } = fakeYokai(ids);
  const fired: Array<{ yokaiId: number | null; damage: number }> = [];
  const k2 = createP2Kodachi({ armor: wearing(arms2), yokai: y, playerPos: () => ({ ...FROM }), sound, onFire: (i) => void fired.push({ yokaiId: i.yokaiId, damage: i.damage }) });
  /** 1P の Kodachi（ふだんの 作り: 1P の そうびを 見る・bindWho なし = who 1） */
  const k1 = (arms: ItemId | null) => new Kodachi({ armor: wearing(arms), yokai: bindWho(y, 1), playerPos: () => ({ ...FROM }) });
  const run = (n: number, ...ks: Array<{ step(): void }>) => {
    for (let i = 0; i < n; i++) for (const k of ks) k.step();
  };
  return { k2, k1, calls, fired, run };
}

describe('AC91 忍びの 手甲の 2P: パンチ・刀の わざの あとに 小太刀の 追い打ち', () => {
  it('パンチが 当たる → 調整表の おくれ（tekkoDelayTicks）回目の step で、1P と 同じ ダメージ・押さない 引数で 妖怪に 追い打ち。2P の 当てたこと（who 2）', () => {
    const r = rig();
    r.k2.step();
    r.k2.combat([punchHit(2)]);
    r.run(DELAY - 1, r.k2);
    expect(r.calls, 'おくれの 前').toHaveLength(0);
    r.run(1, r.k2);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatchObject({ id: 2, amount: NINJA_TUNING.tekkoDamage, knock: { dist: 0, up: 0 }, by: 'kodachi', who: 2 });
    r.run(DELAY * 3, r.k2);
    expect(r.calls, '1 回の 当たりに 1 回').toHaveLength(1);
  });

  it('刀の わざ techHit も 同じ（blade()）。弓・空ぶり・かまえなど ほかの 出来事は 聞かない', () => {
    const r = rig();
    r.k2.blade([techHit(3)]);
    r.k2.blade([{ type: 'techMiss', tick: 0 } as unknown as BladeEvent, { type: 'stance', tick: 0, to: 'high' } as unknown as BladeEvent]);
    r.k2.combat([{ type: 'punchMiss', tick: 0 } as CombatEvent, { type: 'punchStart', tick: 0 } as CombatEvent]);
    expect(r.k2.pending()).toBe(1);
    r.run(DELAY, r.k2);
    expect(r.calls.map((c) => [c.id, c.who])).toEqual([[3, 2]]);
  });

  it('1 回の 当たりが 妖怪 2 体なら 2 体ぶん', () => {
    const r = rig();
    r.k2.combat([punchHit(1), punchHit(2)]);
    r.run(DELAY, r.k2);
    expect(r.calls.map((c) => c.id).sort()).toEqual([1, 2]);
  });

  it('手甲を 着ていない 2P・ほかの 手甲（侍の 手甲）の 2P は 追い打ちしない', () => {
    for (const arms of [null, SAMURAI_GEAR.arms, 'kote' as ItemId]) {
      const r = rig(arms);
      r.k2.combat([punchHit(1)]);
      r.k2.blade([techHit(2)]);
      expect(r.k2.pending(), String(arms)).toBe(0);
      r.run(DELAY * 2, r.k2);
      expect(r.calls, String(arms)).toHaveLength(0);
    }
  });

  it('見るのは 2P の そうびだけ: 1P が 忍びの 手甲でも 2P が はだかなら 2P の パンチに 追い打ちは 出ない（逆も）', () => {
    // 1P は 着ている・2P は はだか
    const a = rig(null);
    const one = a.k1(NINJA_GEAR.arms);
    a.k2.combat([punchHit(1)]);
    expect(a.k2.pending()).toBe(0);
    one.onCombatEvent(punchHit(1));
    expect(one.pending()).toBe(1);
    // 2P は 着ている・1P は はだか
    const b = rig(NINJA_GEAR.arms);
    const none = b.k1(null);
    none.onCombatEvent(punchHit(1));
    expect(none.pending()).toBe(0);
    b.k2.combat([punchHit(1)]);
    expect(b.k2.pending()).toBe(1);
  });

  it('1P の 追い打ちとは 別に 数える: 同じ 妖怪に 同じ ステップで 当てると 1P 分と 2P 分で 2 回。1P が 1、2P が 2 の who', () => {
    const r = rig();
    const one = r.k1(NINJA_GEAR.arms);
    one.onCombatEvent(punchHit(1));
    r.k2.combat([punchHit(1)]);
    r.run(DELAY, one, r.k2);
    expect(r.calls).toHaveLength(2);
    expect(r.calls.map((c) => c.who).sort()).toEqual([1, 2]);
  });

  it('待ちの 上限も 別: 2P が 上限を こえて 当てても 1P の 待ちは へらず、2P の 待ちは 上限まで', () => {
    const r = rig();
    const one = r.k1(NINJA_GEAR.arms);
    one.onCombatEvent(punchHit(1));
    for (let i = 0; i < NINJA_TUNING.tekkoQueueMax + 5; i++) r.k2.combat([punchHit(1)]);
    expect(r.k2.pending()).toBe(NINJA_TUNING.tekkoQueueMax);
    expect(one.pending()).toBe(1);
  });

  it('追い打ちが 出ると 1P と 同じ 音（kodachi）が 1 つ・絵の onFire が 1 回。kodachiHit の 出来事が 1 つ 取り出せて、取り出すと 空', () => {
    const r = rig();
    drainSounds();
    r.k2.combat([punchHit(2)]);
    r.run(DELAY, r.k2);
    expect(drainSounds().filter((n) => n === 'kodachi')).toHaveLength(1);
    expect(r.fired).toEqual([{ yokaiId: 2, damage: NINJA_TUNING.tekkoDamage }]);
    const ev = r.k2.drainEvents();
    expect(ev).toEqual([expect.objectContaining({ type: 'kodachiHit', yokaiId: 2, damage: NINJA_TUNING.tekkoDamage })]);
    expect(r.k2.drainEvents(), 'たまらない').toEqual([]);
  });

  it('clear() で 待ちを すてる（やめる・読み直しの あとに 前の 妖怪 id に 当たらない）', () => {
    const r = rig();
    r.k2.combat([punchHit(1)]);
    r.k2.clear();
    expect(r.k2.pending()).toBe(0);
    r.run(DELAY * 2, r.k2);
    expect(r.calls).toHaveLength(0);
  });
});
