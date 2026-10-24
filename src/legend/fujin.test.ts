import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../contracts';
import * as defs from './defs';

/**
 * WEAPON-7 PR2（風神剣。docs/design/WEAPON-7.md §4・AC21・AC22）: データから 引く 口。
 * 仮の名前（実装側に 確かめたい）: `legendMoveMulOf(settings, item)` = 手に 持っている 物の passive moveMul の 積（なければ 1）。
 * 既存の `legendDefOf`・`chargeOf`・`legendPowerOf`・`pickNushiDrop` は PR1 の まま 使う。
 */
describe('AC21: 風神剣の データを defs から 引く', () => {
  // WEAPON-8 で 期待が 変わった（理由: 風神剣に ためわざ「らせんの かぜ」。docs/design/WEAPON-8.md AC1・§9）
  it('power 6・ためわざ あり（chargeOf = kind spiral）・onAttack に 真空波 1 つ', () => {
    const S = createW2Settings();
    expect(defs.legendPowerOf(S, 'fujin_ken' as never)).toBe(6);
    expect(defs.chargeOf(S, 'fujin_ken' as never)).toEqual({ kind: 'spiral', chargeTicks: 60, launchF: 6, recovery: 40, speed: 12, range: 12, radius: 1.0, damageMul: 2.0, knock: [3, 1] });
    const d = defs.legendDefOf(S, 'fujin_ken' as never);
    expect(d?.item as string).toBe('fujin_ken');
    expect(d?.onAttack.map((x) => x.kind)).toEqual(['wave']);
  });
  it('既定の 表（nushiDrops）から 引くと 雷神剣と 風神剣の 3 本とも 出る（weight 1 ずつ、3,000 回で 900〜1,100 ずつ。PR3 で 虹が 入って 3 本）', async () => {
    const { createRng } = await import('../world/gen/random');
    const S = createW2Settings();
    const rng = createRng(77);
    const n: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const it = defs.pickNushiDrop(S.nushiDrops, rng)!;
      n[it as string] = (n[it as string] ?? 0) + 1;
    }
    // WEAPON-9 で 期待が 変わった（理由: 虹が 表に 入って 3 本。weight 1 ずつ → 3,000 回で 900〜1,100 ずつ。AC6 と 同じ）
    // SAMURAI-1（#300）で 期待が 変わった（理由: 表に 侍装備 4 行が 入って 7 行。帳を 見ない この 引き方では 3,000 ÷ 7 ≒ 429 ずつ → 330〜530）
    for (const k of ['raijin_ken', 'fujin_ken', 'niji']) {
      expect(n[k]).toBeGreaterThanOrEqual(330);
      expect(n[k]).toBeLessThanOrEqual(530);
    }
  });
});

describe('AC22: 手に 持つ 物の passive moveMul', () => {
  const moveMulOf = (defs as unknown as Record<string, (s: unknown, item: string | null) => number>).legendMoveMulOf;
  it('風神剣 1.2・雷神剣 1・ふつうの 刀 1・手が 空 1', () => {
    expect(typeof moveMulOf, 'defs.ts に legendMoveMulOf（仮の名前）').toBe('function');
    const S = createW2Settings();
    expect(moveMulOf(S, 'fujin_ken' as never)).toBeCloseTo(1.2, 10);
    expect(moveMulOf(S, 'raijin_ken')).toBe(1);
    expect(moveMulOf(S, 'katana')).toBe(1);
    expect(moveMulOf(S, null)).toBe(1);
  });
  it('設定で moveMul を 変えると したがう（データ駆動）', () => {
    const S = createW2Settings();
    S.legendary.find((d) => (d.item as string) === 'fujin_ken')!.passive = [{ kind: 'moveMul', mul: 1.5 }];
    expect(moveMulOf(S, 'fujin_ken' as never)).toBeCloseTo(1.5, 10);
  });
});
