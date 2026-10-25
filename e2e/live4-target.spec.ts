import { expect, test } from '@playwright/test';
import { openLive4 } from './helpers/live4';

/**
 * LIVE-4 E2E その 1（docs/design/LIVE-4.md 版 2 §2.1・§2.2・§5・§6 AC1・AC2・AC3・AC8〜AC10・AC12・AC14）: だれ が たたかうか・何 を ねらうか・やめる とき。
 * 数え方: `M.hit()`・`M.hurtMe()` の `rows[k]` は「体力 が へった ステップ」。ねらい を きめた ステップ = きっかけ の ステップ（k）。
 * 「ねらい の あと N ステップ」は k の 次 の ステップ から 数えて N 番目（rows の 番号 k + N）。時間（ms）では 決めない（#255）。
 * #311: 数・状態だけ の 確認（fighters・のりかえ・やめる・12 マス・パリィ で はじく など）は ユニット（src/animals/fightManager.test.ts・live4.test.ts、src/yokai/ai/ai.test.ts の takeCues）へ うつした。ここは 本物 の 入力 → ゲーム → 窓口 の つなぎ（AC2・AC3）だけ。
 * 窓口 は 仕様書 §6.1 の もの（`animals.fighters()`・`list()` の `target`/`hits`・出来事 `machoTarget`/`machoGiveUp`・`yokai.events()` の `hurt.by`）。
 */
test.describe('LIVE-4 ねらい', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC2 きっかけ 1: ぼくとう で 1 回 → その ステップ に target・machoTarget(playerHit)・machoGo 1 回。もう 1 回 たたいても machoGo は ふえない', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const M = (window as any).__M;
      M.base();
      const mid = M.macho(11.5, 6.5);
      const yid = M.yokai('karakasa', 6.5, 6.5);
      const o: any = { mid, yid, faced: M.faceTo(yid, 2) };
      const first = M.hit(yid, { m: mid });
      o.k = first.k;
      o.row = first.rows[first.k] ?? null;
      o.before = first.rows.slice(0, Math.max(0, first.k)).map((x: any) => x.m?.target ?? null);
      o.go1 = first.rows.reduce((n: number, x: any) => n + x.snd.filter((s: string) => s === 'machoGo').length, 0);
      // 2 回目（ぼくとう の もどり を 待って から）
      const rest = M.rec(60, { m: mid, y: yid });
      o.go1b = rest.reduce((n: number, x: any) => n + x.snd.filter((s: string) => s === 'machoGo').length, 0);
      o.faced2 = M.faceTo(yid, 2);
      const second = M.hit(yid, { m: mid });
      o.k2 = second.k;
      o.by2 = (second.rows[second.k]?.yev ?? []).filter((e: any) => e.type === 'hurt').map((e: any) => e.by);
      const more = M.rec(30, { m: mid, y: yid });
      o.go2 = [...second.rows, ...more].reduce((n: number, x: any) => n + x.snd.filter((s: string) => s === 'machoGo').length, 0);
      o.targetEvents = [...first.rows, ...rest, ...second.rows, ...more].flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoTarget');
      return o;
    });
    expect(r.faced && r.faced2, 'ぼくとう が とどく').toBe(true);
    expect(r.k, '1 回目 で 体力 が へった').toBeGreaterThanOrEqual(0);
    const hurt = r.row.yev.find((e: any) => e.type === 'hurt' && e.id === r.yid);
    expect(hurt, 'hurt').toBeTruthy();
    expect(hurt.by, 'hurt の by').toBe('player');
    expect(r.row.m.target, 'その ステップ に target').toBe(r.yid);
    expect(r.before.every((t: unknown) => t === null), 'それ より 前 は null').toBe(true);
    const te = r.row.aev.find((e: any) => e.type === 'machoTarget');
    expect(te, 'その ステップ に machoTarget').toMatchObject({ id: r.mid, yokai: r.yid, cause: 'playerHit' });
    expect(r.go1, 'machoGo 1 回').toBe(1);
    expect(r.go1b).toBe(0);
    expect(r.k2, '2 回目 も 体力 が へった').toBeGreaterThanOrEqual(0);
    expect(r.by2, '2 回目 の へった の は プレイヤー の 一撃（マッチョ の パンチ ではない）').toEqual(['player']);
    expect(r.go2, '同じ 妖怪 を もう 1 回 → machoGo は ふえない').toBe(0);
    expect(r.targetEvents.length, 'machoTarget は 1 つ の ねらい に 1 回').toBe(1);
  });

  test('AC3 きっかけ 2: からかさ に たたかれた ステップ に target・cause playerHurt。ちょうちん の 火の玉 で も その ちょうちん', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const M = (window as any).__M;
      const o: any = {};
      M.base();
      const mid = M.macho(1.5, 6.5);
      const kid = M.yokai('karakasa', M.PX + 1.5, 6.5, { hp: 999 });
      const a = M.hurtMe(kid, { m: mid });
      o.k = a.k;
      o.targetBefore = a.rows.slice(0, Math.max(0, a.k)).map((x: any) => x.m?.target ?? null);
      o.row = a.rows[a.k] ?? null;
      o.kid = kid;
      o.mid = mid;
      // ちょうちん（6 マス）
      M.base();
      const mid2 = M.macho(1.5, 6.5);
      const cid = M.yokai('chochin', M.PX + 6, 6.5, { y: 13 });
      const b = M.hurtMe(cid, { m: mid2 }, 600);
      o.k2 = b.k;
      o.row2 = b.rows[b.k] ?? null;
      o.cid = cid;
      o.mid2 = mid2;
      o.attackNow2 = b.attackNow;
      return o;
    });
    expect(r.k, 'からかさ で 体力 が へった').toBeGreaterThanOrEqual(0);
    expect(r.targetBefore.every((t: unknown) => t === null), 'たたかれる 前 は null').toBe(true);
    expect(r.row.m.target).toBe(r.kid);
    expect(r.row.aev.find((e: any) => e.type === 'machoTarget')).toMatchObject({ id: r.mid, yokai: r.kid, cause: 'playerHurt' });
    expect(r.attackNow2, 'ちょうちん が 火の玉 を うつ').not.toBeNull();
    expect(r.k2, '火の玉 で 体力 が へった').toBeGreaterThanOrEqual(0);
    expect(r.row2.m.target, 'その ちょうちん').toBe(r.cid);
    expect(r.row2.aev.find((e: any) => e.type === 'machoTarget')).toMatchObject({ id: r.mid2, yokai: r.cid, cause: 'playerHurt' });
  });
});
