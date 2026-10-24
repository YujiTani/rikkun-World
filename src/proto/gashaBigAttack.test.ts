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
  it('調整表: 1〜3 回・休み 30〜40 秒・攻撃の 表に slam2', () => {
    expect(T.attack.countMin).toBe(1);
    expect(T.attack.countMax).toBe(3);
    expect(T.tired.restSec).toEqual([30, 40]);
    expect(T.attack.table.map((r) => r.name)).toContain('slam2');
  });

  it('1 サイクル = 攻撃を 1〜3 回 → つかれて 30〜40 秒 休む → おわり（次の サイクルへ）', () => {
    const counts = new Set<number>();
    const c = new AttackCycle(1);
    for (let i = 0; i < 12; i++) {
      c.begin();
      const r = lap(c);
      expect(r.attacks.length).toBeGreaterThanOrEqual(T.attack.countMin);
      expect(r.attacks.length).toBeLessThanOrEqual(T.attack.countMax);
      expect(r.restSec).toBeGreaterThanOrEqual(T.tired.restSec[0] - 0.05);
      expect(r.restSec).toBeLessThanOrEqual(T.tired.restSec[1] + 0.05);
      // 順番: 攻撃 … 攻撃 → つかれる → 立ち上がる
      expect(r.seq.slice(-2)).toEqual(['tired', 'tiredEnd']);
      expect(r.seq.slice(0, -2).every((s) => s === 'attack')).toBe(true);
      counts.add(r.attacks.length);
    }
    expect([...counts].sort()).toEqual([1, 2, 3]); // くじで 1・2・3 回が ぜんぶ 出る
  });

  it('同じ シードなら 同じ 回数・休みの 長さ（再現できる）', () => {
    const a = new AttackCycle(5), b = new AttackCycle(5);
    for (let i = 0; i < 4; i++) { a.begin(); b.begin(); const x = lap(a), y = lap(b); expect(x.attacks.length).toBe(y.attacks.length); expect(x.restSec).toBeCloseTo(y.restSec, 6); }
  });

  it('攻撃と 攻撃の 間に ならし（gapSec）が ある・最初は firstGapSec', () => {
    const saved = [T.attack.countMin, T.attack.countMax];
    T.attack.countMin = 3; T.attack.countMax = 3; // 2 回目の ならしを 見る ため 3 回に 固定
    const c = new AttackCycle(2);
    c.begin();
    T.attack.countMin = saved[0]!; T.attack.countMax = saved[1]!;
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
      T.attack.table.push({ name: 'sweep', weight: 1 });
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
