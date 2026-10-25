import { describe, expect, it } from 'vitest';
import { AttackCycle } from './gashaBigAttack';
import { TUNE as T } from './gashaBigTuning';

const DT = 1 / 60;

/** サイクルを 1 周 まわして、攻撃の 開始と 休みの 長さを 記録する（攻撃は attackSec 秒で おわる ことに する） */
function lap(c: AttackCycle, attackSec = 9): { attacks: string[]; restSec: number; seq: string[] } {
  const attacks: string[] = [], seq: string[] = [];
  let restSec = 0, attackLeft = 0, guard = 0;
  for (; guard < 60 * 600; guard++) {
    const before = c.phase;
    if (attackLeft > 0) { attackLeft -= DT; if (attackLeft <= 0) c.attackEnded(); }
    const ev = c.update(DT);
    if (ev.start) { attacks.push(ev.start); seq.push('attack'); attackLeft = attackSec; }
    if (c.phase === 'tired') { restSec += DT; if (before !== 'tired') seq.push('tired'); }
    if (ev.tiredEnd) { seq.push('tiredEnd'); break; }
  }
  expect(guard).toBeLessThan(60 * 600);
  return { attacks, restSec, seq };
}

describe('怒りの 攻撃サイクル（gashaBigAttack.ts）', () => {
  it('調整表: 3〜5 回・休む 確率 50%・休み 30〜40 秒・攻撃の 表に slam2', () => {
    expect(T.attack.minCount).toBe(3);
    expect(T.attack.maxCount).toBe(5);
    expect(T.attack.restChance).toBe(0.5);
    expect(T.tired.restSec).toEqual([30, 40]);
    expect(T.attack.table.map((r) => r.name)).toContain('slam2');
  });

  it('1 サイクル = 攻撃を 3〜5 回 → つかれて 30〜40 秒 休む → おわり（次の サイクルへ）', () => {
    const counts = new Set<number>();
    const c = new AttackCycle(1);
    for (let i = 0; i < 40; i++) {
      c.begin();
      const r = lap(c);
      expect(r.attacks.length).toBeGreaterThanOrEqual(T.attack.minCount);
      expect(r.attacks.length).toBeLessThanOrEqual(T.attack.maxCount);
      expect(r.restSec).toBeGreaterThanOrEqual(T.tired.restSec[0] - 0.05);
      expect(r.restSec).toBeLessThanOrEqual(T.tired.restSec[1] + 0.05);
      // 順番: 攻撃 … 攻撃 → つかれる → 立ち上がる
      expect(r.seq.slice(-2)).toEqual(['tired', 'tiredEnd']);
      expect(r.seq.slice(0, -2).every((s) => s === 'attack')).toBe(true);
      counts.add(r.attacks.length);
    }
    expect([...counts].sort()).toEqual([3, 4, 5]); // くじで 3・4・5 回が ぜんぶ 出る
  });

  it('休む くじ: 1・2 回目の あとは 休まない。5 回目の あとは 必ず 休む。restChance 0 なら 5 回、1 なら 3 回', () => {
    const saved = T.attack.restChance;
    try {
      const run = (chance: number) => {
        T.attack.restChance = chance;
        const out: number[] = [];
        const c = new AttackCycle(7);
        for (let i = 0; i < 10; i++) { c.begin(); out.push(lap(c).attacks.length); }
        return out;
      };
      expect(run(0).every((n) => n === 5)).toBe(true);
      expect(run(1).every((n) => n === 3)).toBe(true);
      // 50%: 3 回目から 毎回 くじ（3 回で 休む のは 約半分）
      T.attack.restChance = 0.5;
      const n3 = (() => { let k = 0; const c = new AttackCycle(11); for (let i = 0; i < 200; i++) { c.begin(); if (lap(c).attacks.length === 3) k++; } return k; })();
      expect(n3).toBeGreaterThan(70);
      expect(n3).toBeLessThan(130);
    } finally { T.attack.restChance = saved; }
  });

  it('同じ シードなら 同じ 回数・休みの 長さ（再現できる）', () => {
    const a = new AttackCycle(5), b = new AttackCycle(5);
    for (let i = 0; i < 4; i++) { a.begin(); b.begin(); const x = lap(a), y = lap(b); expect(x.attacks.length).toBe(y.attacks.length); expect(x.restSec).toBeCloseTo(y.restSec, 6); }
  });

  it('攻撃と 攻撃の 間に ならし（gapSec）が ある・最初は firstGapSec', () => {
    const c = new AttackCycle(2);
    c.begin();
    let t = 0;
    while (!c.update(DT).start) t += DT;
    expect(t).toBeGreaterThanOrEqual(T.attack.firstGapSec - 0.05);
    expect(t).toBeLessThanOrEqual(T.attack.firstGapSec + 0.05);
    expect(c.phase).toBe('attack');
    c.attackEnded();
    expect(c.phase).toBe('gap');
    t = 0;
    while (!c.update(DT).start) t += DT;
    expect(t).toBeGreaterThanOrEqual(T.attack.gapSec[0] - 0.05);
    expect(t).toBeLessThanOrEqual(T.attack.gapSec[1] + 0.05);
  });

  it('攻撃中は 次の 攻撃が はじまらない', () => {
    const c = new AttackCycle(3);
    c.begin();
    while (!c.update(DT).start) { /* ならし */ }
    for (let i = 0; i < 60 * 30; i++) expect(c.update(DT).start).toBeUndefined();
    expect(c.phase).toBe('attack');
  });

  it('攻撃の 表に 行を 足すだけで 種類が ふえる（重みで 選ぶ）', () => {
    const saved = T.attack.table.slice();
    try {
      T.attack.table.length = 0; T.attack.table.push({ name: 'slam2', weight: 1 }, { name: 'sweep', weight: 1 });
      const seen = new Set<string>();
      const c = new AttackCycle(9);
      for (let i = 0; i < 20; i++) { c.begin(); for (const a of lap(c).attacks) seen.add(a); }
      expect([...seen].sort()).toEqual(['slam2', 'sweep']);
    } finally { T.attack.table.length = 0; T.attack.table.push(...saved); }
  });

  it('forceAttack / forceTired（デバッグ）と reset', () => {
    const c = new AttackCycle(4);
    c.begin();
    c.forceAttack('slam2');
    expect(c.phase).toBe('attack');
    expect(c.current).toBe('slam2');
    c.forceTired(25);
    expect(c.phase).toBe('tired');
    expect(c.left).toBeCloseTo(25, 6);
    c.reset();
    expect(c.phase).toBe('off');
    expect(c.update(DT)).toEqual({});
  });
});
