import { expect, test } from '@playwright/test';
import { openLive4 } from './helpers/live4';

/**
 * LIVE-4 E2E その 2（docs/design/LIVE-4.md 版 2 §2.3・§2.4・§2.5・§6 AC4〜AC7・AC11・AC13・AC15）: はしる・パンチ・きりあげ・たおす・とどかない・やられない・当たらない。
 * 数え方（仕様書 AC4）: マッチョ が とどいた ステップ（`state` が 'punch' に なった 最初 の ステップ）を 0 と して、5 ステップ 目 に 当たる。
 *   `rows` は 1 ステップ ずつ きろく。`s = punchStart(rows)` の 行 が 0 ステップ目、`rows[s + n]` が n ステップ目。
 * #311: パンチ・きりあげ の 数、のりかえ、とどかない、やられない などは ユニット（src/animals/fightManager.test.ts、src/yokai/ai/ai.test.ts）へ うつした。ここは つなぎ（AC7 たおす・AC15b や）だけ。
 * 当たる コマ・間隔 は 設定 `bladeTech.thrust`（startup・active・recovery）から 計算 する: 1 回目 = startup + 1、くり返し = startup + active + recovery。
 * 妖怪 の 位置 は 止める（ai:false）。体力 は 多め。時間（ms）では 決めない（#255）。
 */

/** ページ の 中 で 使う 共通 の 準備: マッチョ を 5 マス 先 に 置き、妖怪 を ぼくとう で 1 回 たたいて ねらわせる。きろく rows（trigger の ステップ から）を 返す */
const SETUP = `
  window.__fight = (kind, opts) => {
    const h = window.__rikkun;
    const M = window.__M;
    opts = opts || {};
    M.base();
    const mid = M.macho(opts.mx ?? 11.5, opts.mz ?? 6.5);
    const yid = M.yokai(kind, opts.yx ?? 6.5, opts.yz ?? 6.5, { hp: 9999 });
    M.faceTo(yid, 2);
    const trig = M.hit(yid, { m: mid });
    h.yokai.setHp(yid, 9999);
    return { mid, yid, trig };
  };
`;

test.describe('LIVE-4 たたかう', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC7 たおす: 3 回目（きりあげ）で たおれる。経験値・reward は プレイヤー が たおした のと 同じ・machoKO:* 1・実績・machoFlex 1 回・flex 30 ステップ → ついてくる', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(SETUP);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      // ようかいだま（yokai_orb）は M3 第 1 版の なごりで もう 使わない（矛盾 C4）。ごほうび は「経験値」と「defeat の reward」と「ドロップ の 出来事」で 見る
      const gain = (f: () => any) => {
        h.level.set(1, 0);
        const rows = f();
        return { xp: h.level.get().xp, level: h.level.get().level, reward: rows.flatMap((x: any) => x.yev).find((e: any) => e.type === 'defeat')?.reward ?? null };
      };
      // 基準: プレイヤー が たおした とき の ごほうび（同じ 場所・同じ 種類）
      M.base();
      const y0 = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      M.faceTo(y0, 2);
      h.yokai.setHp(y0, 1);
      const base = gain(() => {
        const t = M.hit(y0, {});
        return [...t.rows, ...M.rec(5, {})];
      });
      // マッチョ
      const { mid, yid, trig } = (window as any).__fight('karakasa');
      h.yokai.setHp(yid, 6);
      const o: any = { base, mid, yid, trigK: trig.k };
      h.level.set(1, 0);
      const stat0 = A.stat('machoKO:*');
      const rows = M.rec(200, { m: mid, y: yid }, (x: any) => x.yev.some((e: any) => e.type === 'defeat'));
      const dk = rows.length - 1;
      o.defeat = rows[dk].yev.some((e: any) => e.type === 'defeat');
      o.defeatPunchUpper = rows[dk].aev.find((e: any) => e.type === 'machoPunch')?.upper ?? null;
      o.defeatRel = dk - M.punchStart(rows);
      const after = M.rec(60, { m: mid, y: yid });
      const all = [...rows, ...after];
      o.xp = h.level.get().xp;
      o.level = h.level.get().level;
      o.reward = all.flatMap((x: any) => x.yev).find((e: any) => e.type === 'defeat')?.reward ?? null;
      o.stat = A.stat('machoKO:*') - stat0;
      o.unlocked = A.unlocked('animal.machoKO.1');
      o.ko = all.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoKO');
      o.flexSnd = all.flatMap((x: any) => x.snd).filter((s: string) => s === 'machoFlex').length;
      o.states = all.map((x: any) => x.m?.state);
      o.flexRun = all.filter((x: any) => x.m?.state === 'flex' && !x.frozen).length; // ヒットストップ（たおした = 大 7）で 止まった ステップ は 数えない
      o.frozenFlex = all.filter((x: any) => x.m?.state === 'flex' && x.frozen).length;
      o.lastState = o.states[o.states.length - 1];
      o.giveUp = all.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoGiveUp').map((e: any) => e.reason);
      o.targetEnd = all[all.length - 1].m.target;
      return o;
    });
    expect(r.trigK).toBeGreaterThanOrEqual(0);
    expect(r.defeat, 'たおれた').toBe(true);
    expect(r.defeatPunchUpper, '3 回目（きりあげ）で').toBe(true);
    expect(r.defeatRel, '87 ステップ目').toBe(5 + 41 * 2);
    expect(r.base.xp, '基準: プレイヤー が たおす と 経験値').toBeGreaterThan(0);
    expect(r.reward, 'defeat の reward は ある（数 は ドロップ表 の 乱数 なので くらべない）').not.toBeNull();
    expect(r.xp, '経験値 は プレイヤー に（同じ 数）').toBe(r.base.xp);
    expect(r.level).toBe(r.base.level);
    expect(r.stat, '記録 machoKO:*').toBe(1);
    expect(r.unlocked, '実績 animal.machoKO.1').toBe(true);
    expect(r.ko[0], '出来事 machoKO').toMatchObject({ id: r.mid, yokai: r.yid });
    expect(r.flexSnd, 'machoFlex 1 回').toBe(1);
    expect(r.flexRun, 'flex 30 ステップ（止まって いない ステップ）').toBe(30);
    // ついてくる に もどる（プレイヤー の そば では 'idle' で 立って いる。LIVE-1 の ついてくる と 同じ）
    expect(['follow', 'idle', 'wander', 'look', 'rest'], 'そのあと ついてくる').toContain(r.lastState);
    expect(r.giveUp, 'defeat で やめる').toEqual(['defeat']);
    expect(r.targetEnd).toBeNull();
  });

  test('AC15b や は マッチョ に 当たらない（ゆみ で 前 の マッチョ を ねらっても のこる・やが とどまらない）', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      M.base();
      h.inventory.setSlot(1, { item: 'yumi', count: 1 });
      h.inventory.setSlot(2, { item: 'ya', count: 10 });
      h.inventory.select(1);
      h.step(12);
      const mid = M.macho(12.5, 6.5);
      h.player.set({ position: { x: 8.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      h.animals.events();
      h.input.press('primary');
      h.step(45);
      h.input.release('primary');
      h.step(100);
      const m = M.one(mid);
      const near = h.bow.stuck().filter((s: any) => Math.hypot(s.position.x - m.x, s.position.z - m.z) < 0.6).length;
      h.inventory.select(0);
      h.step(20);
      const kid = M.yokai('karakasa', 6.5, 6.5, { hp: 999 });
      M.faceTo(kid, 2);
      const ctl = M.hit(kid, { m: mid });
      return { ctl: ctl.rows[ctl.k]?.m?.target ?? null, kid, alive: !!m, hurt: h.animals.events().filter((e: any) => e.type === 'hurt' || e.type === 'die').length, near, shot: h.inventory.count('ya') < 10, target: A.one(mid).target ?? null };
    });
    expect(r.shot, 'や を うった').toBe(true);
    expect(r.alive).toBe(true);
    expect(r.hurt).toBe(0);
    expect(r.near, 'や が マッチョ に ささらない').toBe(0);
    expect(r.ctl, '見張り: そのあと たたく と ねらう').toBe(r.kid);
  });
});
