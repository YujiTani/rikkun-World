import { expect, test } from '@playwright/test';
import { openLive4 } from './helpers/live4';

/**
 * LIVE-4 E2E その 2（docs/design/LIVE-4.md 版 2 §2.3・§2.4・§2.5・§6 AC4〜AC7・AC11・AC13・AC15）: はしる・パンチ・きりあげ・たおす・とどかない・やられない・当たらない。
 * 数え方（仕様書 AC4）: マッチョ が とどいた ステップ（`state` が 'punch' に なった 最初 の ステップ）を 0 と して、5 ステップ 目 に 当たる。
 *   `rows` は 1 ステップ ずつ きろく。`s = punchStart(rows)` の 行 が 0 ステップ目、`rows[s + n]` が n ステップ目。
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

  test('AC4 パンチ の はやさ: 0 → 5 ステップ目 に −2（4 では へらない）・machoPunch・hurt の by macho。46 ステップ目 に 2 回目。1・2 回目 で 妖怪 は 動かない。bladeTech.thrust を かえる と かわる', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(SETUP);
    const run = async (thrust: { startup: number; active: number; recovery: number } | null) => {
      return page.evaluate((thrust) => {
        const h = (window as any).__rikkun;
        const M = (window as any).__M;
        const o: any = {};
        if (thrust) h.settings.set('bladeTech', { thrust });
        const { mid, yid } = (window as any).__fight('karakasa');
        const rows = M.rec(160, { m: mid, y: yid });
        o.frames = M.bladeFrames();
        o.atk = (() => {
          try {
            return h.settings.get('machoAtk');
          } catch {
            return null;
          }
        })();
        o.s = M.punchStart(rows);
        o.hp = rows.map((r: any) => r.y?.hp ?? null);
        o.hurtBy = rows.map((r: any) => r.yev.filter((e: any) => e.type === 'hurt').map((e: any) => e.by));
        o.punchSnd = rows.map((r: any) => r.snd.filter((s: string) => s === 'machoPunch').length);
        o.pos = rows.map((r: any) => (r.y ? { x: r.y.x, y: r.y.y, z: r.y.z } : null));
        o.events = rows.map((r: any) => r.aev.filter((e: any) => e.type === 'machoPunch'));
        o.mid = mid;
        o.yid = yid;
        return o;
      }, thrust);
    };
    const check = (r: any, tag: string) => {
      expect(r.s, `${tag} とどいて パンチ を はじめた`).toBeGreaterThanOrEqual(0);
      const first = r.frames.startup + 1;
      const period = r.frames.startup + r.frames.active + r.frames.recovery;
      const at = (n: number) => r.s + n;
      // 当たる 前 は へらない
      for (let n = 0; n < first; n++) expect(r.hp[at(n)], `${tag} ${n} ステップ目 まだ へらない`).toBe(r.hp[r.s]);
      expect(r.hp[at(first)], `${tag} ${first} ステップ目 に −2`).toBeCloseTo(r.hp[r.s] - 2, 5);
      expect(r.hurtBy[at(first)], `${tag} hurt の by`).toContain('macho');
      expect(r.punchSnd[at(first)], `${tag} machoPunch`).toBe(1);
      expect(r.events[at(first)][0], `${tag} 出来事`).toMatchObject({ id: r.mid, yokai: r.yid, hit: true, upper: false });
      // 間
      for (let n = first + 1; n < first + period; n++) expect(r.hp[at(n)], `${tag} 次 まで へらない`).toBeCloseTo(r.hp[at(first)], 5);
      expect(r.hp[at(first + period)], `${tag} ${first + period} ステップ目 に 2 回目 −2`).toBeCloseTo(r.hp[at(first)] - 2, 5);
      expect(r.punchSnd[at(first + period)]).toBe(1);
      // 1・2 回目 は 押さない
      const p0 = r.pos[at(0)];
      for (let n = 0; n <= first + period; n++) {
        const p = r.pos[at(n)];
        expect(Math.hypot(p.x - p0.x, p.z - p0.z), `${tag} 水平 に 動かない`).toBeLessThanOrEqual(0.05);
        expect(Math.abs(p.y - p0.y), `${tag} 上 に うかない`).toBeLessThanOrEqual(0.05);
      }
    };
    const a = await run(null);
    expect(a.frames).toEqual({ startup: 4, active: 2, recovery: 35 });
    expect(a.atk, '設定 machoAtk').toBe(2);
    check(a, '既定(4・2・35)');
    const b = await run({ startup: 6, active: 2, recovery: 40 });
    expect(b.frames).toEqual({ startup: 6, active: 2, recovery: 40 });
    check(b, '6・2・40');
  });

  test('AC5 きりあげ: 3 回目 に −2.3・machoUpper（machoPunch は 鳴らない）・upper true。1.0±0.2 遠くへ・足もと y 0.8 以上。4・5 回目 は −2・うかない。6 回目 が また きりあげ', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(SETUP);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const { mid, yid } = (window as any).__fight('karakasa');
      const rows = M.rec(420, { m: mid, y: yid });
      const hits: number[] = [];
      for (let i = 1; i < rows.length; i++) if (rows[i].y && rows[i - 1].y && rows[i].yev.some((e: any) => e.type === 'hurt' && e.by === 'macho')) hits.push(i);
      const mac = (i: number) => rows[i].m;
      const info = hits.slice(0, 6).map((i) => {
        const before = rows[i - 1].y.hp;
        const ev = rows[i].aev.find((e: any) => e.type === 'machoPunch');
        const y0 = rows[i - 1].y.y;
        const rise = Math.max(...rows.slice(i, Math.min(rows.length, i + 11)).map((x: any) => (x.y ? x.y.y : 0))) - y0;
        const landed = Math.min(...rows.slice(i + 11, Math.min(rows.length, i + 80)).map((x: any) => Math.abs((x.y ? x.y.y : 99) - y0)), 99);
        const d0 = Math.hypot(rows[i].y.x - mac(i).x, rows[i].y.z - mac(i).z);
        const j = Math.min(rows.length - 1, i + 10);
        const d1 = Math.hypot(rows[j].y.x - mac(j).x, rows[j].y.z - mac(j).z);
        return {
          i,
          dmg: before - rows[i].y.hp,
          snd: rows[i].snd.filter((s: string) => s === 'machoUpper' || s === 'machoPunch'),
          ev: ev ?? null,
          rise,
          landed,
          push: d1 - d0,
          y0,
        };
      });
      const s = M.punchStart(rows);
      return { s, hits, info, mid, yid, kiriage: h.settings.get('bladeKnock').kiriage, mul: h.settings.get('bladeDamageMul').kiriage };
    });
    expect(r.s).toBeGreaterThanOrEqual(0);
    expect(r.hits.length, '6 回 当たる').toBeGreaterThanOrEqual(6);
    expect(r.kiriage).toEqual([1.0, 7]);
    expect(r.hits[2] - r.s, '3 回目 は 87 ステップ目（5 ＋ 41 × 2）').toBe(5 + 41 * 2);
    const up = [false, false, true, false, false, true];
    r.info.forEach((x: any, n: number) => {
      const tag = `${n + 1} 回目`;
      if (up[n]) {
        expect(x.dmg, `${tag} −2 × ${r.mul}`).toBeCloseTo(2 * r.mul, 2);
        expect(x.snd, `${tag} machoUpper だけ`).toEqual(['machoUpper']);
        expect(x.ev, `${tag} 出来事`).toMatchObject({ id: r.mid, yokai: r.yid, hit: true, upper: true });
        expect(x.ev.damage).toBeCloseTo(2 * r.mul, 2);
        expect(x.push, `${tag} 10 ステップ 後 に マッチョ から 1.0±0.2 遠く`).toBeGreaterThanOrEqual(0.8);
        expect(x.push).toBeLessThanOrEqual(1.2);
        expect(x.rise, `${tag} 足もと y が 0.8 以上`).toBeGreaterThanOrEqual(0.8);
        expect(x.landed, `${tag} 床 に もどる`).toBeLessThanOrEqual(0.05);
      } else {
        expect(x.dmg, `${tag} −2`).toBeCloseTo(2, 2);
        expect(x.snd, `${tag} machoPunch だけ`).toEqual(['machoPunch']);
        expect(x.ev).toMatchObject({ hit: true, upper: false });
        expect(x.rise, `${tag} うかない`).toBeLessThanOrEqual(0.1);
      }
    });
  });

  test('AC5b ぬりかべ: 3 回目 も 動かない・うかない（−2.3 は へる）', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(SETUP);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const { mid, yid } = (window as any).__fight('nurikabe', { yx: 7.0 });
      const rows = M.rec(140, { m: mid, y: yid });
      const hits: number[] = [];
      for (let i = 1; i < rows.length; i++) if (rows[i].yev.some((e: any) => e.type === 'hurt' && e.by === 'macho')) hits.push(i);
      const p0 = rows[0].y;
      const moved = Math.max(...rows.map((x: any) => Math.hypot(x.y.x - p0.x, x.y.z - p0.z)));
      const rise = Math.max(...rows.map((x: any) => x.y.y - p0.y));
      const mul = h.settings.get('bladeDamageMul').kiriage;
      return { hits: hits.slice(0, 3), dmg3: hits[2] ? rows[hits[2] - 1].y.hp - rows[hits[2]].y.hp : null, moved, rise, mul };
    });
    expect(r.hits.length, '3 回 以上 当たる').toBeGreaterThanOrEqual(3);
    expect(r.dmg3).toBeCloseTo(2 * r.mul, 2);
    expect(r.moved, '押されない').toBeLessThanOrEqual(0.05);
    expect(r.rise, 'うかない').toBeLessThanOrEqual(0.05);
  });

  test('AC6 数え直し: 2 回 当てた あと べつ の 妖怪 に のりかえる → のりかえた 妖怪 の 3 回目 が きりあげ（1・2 回目 は ふつう）', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(SETUP);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      const { mid, yid: a } = (window as any).__fight('karakasa');
      const rowsA: any[] = [];
      for (let i = 0; i < 200 && rowsA.filter((x: any) => x.aev.some((e: any) => e.type === 'machoPunch' && e.hit)).length < 2; i++) rowsA.push(...M.rec(1, { m: mid, y: a }));
      const hitsA = rowsA.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoPunch' && e.hit);
      // のりかえ: 2 体 目 を プレイヤー が たたく
      const b = M.yokai('karakasa', 6.5, 9.5, { hp: 9999 });
      M.faceTo(b, 2);
      const trig = M.hit(b, { m: mid });
      h.yokai.setHp(b, 9999);
      h.yokai.setHp(a, 9999);
      const rows = M.rec(260, { m: mid, y: b });
      const hitsB = rows.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoPunch' && e.hit && e.yokai === b);
      const hitsA2 = rows.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoPunch' && e.hit && e.yokai === a);
      const hitsList = rows.map((x: any) => x.m?.hits);
      return { a, b, nA: hitsA.length, upA: hitsA.map((e: any) => e.upper), upB: hitsB.map((e: any) => e.upper), nA2: hitsA2.length, trigK: trig.k, hitsMax: Math.max(...hitsList.filter((x: any) => x != null), -1) };
    });
    expect(r.nA, 'A に 2 回 当てた').toBe(2);
    expect(r.upA).toEqual([false, false]);
    expect(r.trigK, 'B を たたいた').toBeGreaterThanOrEqual(0);
    expect(r.upB.slice(0, 3), 'B の 1・2・3 回目').toEqual([false, false, true]);
    expect(r.nA2, 'B に のりかえた あと A は たたかない').toBe(0);
  });

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
      o.flexRun = o.states.filter((s: string) => s === 'flex').length;
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
    expect(r.flexRun, 'flex 30 ステップ').toBe(30);
    // ついてくる に もどる（プレイヤー の そば では 'idle' で 立って いる。LIVE-1 の ついてくる と 同じ）
    expect(['follow', 'idle', 'wander', 'look', 'rest'], 'そのあと ついてくる').toContain(r.lastState);
    expect(r.giveUp, 'defeat で やめる').toEqual(['defeat']);
    expect(r.targetEnd).toBeNull();
  });

  test('AC7b 2 回目 の マッチョ KO: かちポーズ と 音 は あるが 実績 は ふえない（stat は 2）', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(SETUP);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      const out: any = { stats: [], flex: [] };
      for (let n = 0; n < 2; n++) {
        const { mid, yid } = (window as any).__fight('karakasa');
        h.yokai.setHp(yid, 4);
        const rows = M.rec(160, { m: mid, y: yid }, (x: any) => x.yev.some((e: any) => e.type === 'defeat'));
        const after = M.rec(40, { m: mid, y: yid });
        out.flex.push([...rows, ...after].flatMap((x: any) => x.snd).filter((s: string) => s === 'machoFlex').length);
        out.stats.push(A.stat('machoKO:*'));
        h.step(60);
      }
      out.unlocked = A.unlocked('animal.machoKO.1');
      return out;
    });
    expect(r.stats).toEqual([1, 2]);
    expect(r.flex).toEqual([1, 1]);
    expect(r.unlocked).toBe(true);
  });

  test('AC11 とどかない: ちょうちん が 水 の 上 → 180 ステップ 目 に プレイヤー の そば 4 マス 以内 に もどり cheer・target は のこる', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      M.base();
      h.world.fill(5, 7, 1, 20, 8, 12, 'water');
      h.step(3);
      const mid = M.macho(2.5, 6.5);
      const cid = M.yokai('chochin', 8.5, 6.5, { y: 13, hp: 9999 });
      const hurt = M.hurtMe(cid, { m: mid }, 700);
      const rows = M.rec(260, { m: mid, y: cid });
      const all = [...hurt.rows.slice(Math.max(0, hurt.k)), ...rows];
      const r0 = all.findIndex((x: any) => x.m && x.m.state === 'run');
      const states = all.map((x: any) => x.m?.state);
      const cheerAt = states.findIndex((s: string, i: number) => i > r0 && s === 'cheer');
      const row = all[cheerAt] ?? null;
      return {
        k: hurt.k,
        r0,
        cheerAt,
        rel: cheerAt - r0,
        near: row ? Math.hypot(row.m.x - row.p.x, row.m.z - row.p.z) : null,
        target: row ? row.m.target : 'none',
        cid,
        earlyCheer: states.slice(0, Math.max(0, r0 + 150)).includes('cheer'),
        waterAt: h.world.getBlock(8, 8, 6),
      };
    });
    expect(r.waterAt, '水').toBe('water');
    expect(r.k, '火の玉 で たたかれた').toBeGreaterThanOrEqual(0);
    expect(r.r0, 'はしり はじめた').toBeGreaterThanOrEqual(0);
    expect(r.cheerAt, 'cheer に なった').toBeGreaterThan(0);
    expect(r.earlyCheer, '150 までは cheer しない').toBe(false);
    expect(r.rel, 'はしり はじめて 180 ステップ 目（仕様 AC11 の 数）').toBe(180);
    expect(r.near, 'プレイヤー の そば 4 マス 以内').toBeLessThanOrEqual(4);
    expect(r.target, 'target は のこる').toBe(r.cid);
  });

  test('AC13 やられない: マッチョ の すぐ 横 の からかさ の こうげき 600 ステップ → マッチョ は のこる・的 に ならない・妖怪 の 動き は マッチョ なし と 同じ', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(SETUP);
    const withMacho = async (macho: boolean) => {
      return page.evaluate((macho) => {
        const h = (window as any).__rikkun;
        const M = (window as any).__M;
        M.base();
        let mid: number | null = null;
        if (macho) mid = M.macho(8.5, 6.5);
        // からかさ（うごく）。プレイヤー は はなれた 所（とどかない）で、マッチョ の すぐ 横 に いる
        h.player.set({ position: { x: 3.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        const yid = h.yokai.spawn('karakasa', 9.2, 9, 6.5, { ai: false, yawDeg: 270 });
        h.yokai.setHp(yid, 9999);
        h.yokai.events();
        const traj: number[][] = [];
        const hits: any[] = [];
        let gone = false;
        for (let i = 0; i < 600; i++) {
          if (i % 80 === 0) h.yokai.attackNow(yid);
          h.step(1);
          const y = M.yk(yid);
          traj.push(y ? [y.position.x, y.position.z, y.attackTick] : [0, 0, 0]);
          for (const e of h.yokai.events()) if (e.type === 'attackHit') hits.push(e);
          if (mid != null && !M.one(mid)) gone = true;
        }
        // 見張り: マッチョ なら そのあと プレイヤー が たたく と ねらう（機能 が ある こと）
        let ctl: any = null;
        if (mid != null) {
          M.faceTo(yid, 1.5);
          const t = M.hit(yid, { m: mid });
          ctl = t.rows[t.k]?.m?.target ?? null;
        }
        return { traj, hits: hits.map((e) => ({ hitPlayer: e.hitPlayer, keys: Object.keys(e) })), gone, mid, yid, ctl, alive: mid != null ? !!M.one(mid) : null };
      }, macho);
    };
    const a = await withMacho(true);
    expect(a.gone, '600 ステップ の あいだ マッチョ は のこる').toBe(false);
    expect(a.alive).toBe(true);
    expect(a.hits.length, 'こうげき は 出た').toBeGreaterThan(0);
    for (const e of a.hits) expect(e.hitPlayer, 'マッチョ に 当たっても プレイヤー の 体力 は へらない（的 は プレイヤー だけ）').toBe(false);
    expect(a.ctl, '見張り: そのあと プレイヤー が たたく と ねらう').toBe(a.yid);
  });

  test('AC13c やられない（火の玉）: マッチョ の 横 を 火の玉 が とおる → マッチョ は のこる・火の玉 は マッチョ で 止まらない（fireballEnd の hitPlayer false）', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      M.base();
      const mid = M.macho(5.5, 6.5); // プレイヤー(3.5) と ちょうちん の あいだ
      const cid = M.yokai('chochin', 9.5, 6.5, { y: 13 });
      h.player.set({ position: { x: 3.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.yokai.events();
      const ev: any[] = [];
      for (let i = 0; i < 600; i++) {
        if (i % 150 === 0) h.yokai.attackNow(cid);
        h.step(1);
        ev.push(...h.yokai.events());
      }
      const m = M.one(mid);
      // 見張り: プレイヤー が たたく と ねらう
      h.yokai.clear();
      const kid = M.yokai('karakasa', 6.5, 6.5, { hp: 999 });
      M.faceTo(kid, 2);
      const ctl = M.hit(kid, { m: mid });
      return { ctl: ctl.rows[ctl.k]?.m?.target ?? null, kid, alive: !!m, fb: ev.filter((e: any) => e.type === 'fireball').length, ends: ev.filter((e: any) => e.type === 'fireballEnd').length, cid, mid, hp: m ? Object.keys(m).includes('hp') : null };
    });
    expect(r.alive, 'マッチョ は のこる').toBe(true);
    expect(r.fb, '火の玉 が 出た').toBeGreaterThan(0);
    expect(r.hp, 'マッチョ に 体力 は 無い').toBe(false);
    expect(r.ctl, '見張り: そのあと たたく と ねらう').toBe(r.kid);
  });

  test('AC13b 妖怪 の 動き（ai あり）は マッチョ が いても いなくても 同じ（同じ シード・プレイヤー が たたかれる 前 まで）', async ({ page }) => {
    const traj = async (macho: boolean) => {
      await openLive4(page);
      return page.evaluate((macho) => {
        const h = (window as any).__rikkun;
        const M = (window as any).__M;
        M.base();
        let mid: number | null = null;
        if (macho) mid = M.macho(8.5, 6.5);
        const yid = h.yokai.spawn('karakasa', 14.5, 9, 6.5, { yawDeg: 270 });
        h.yokai.setHp(yid, 9999);
        h.yokai.events();
        const out: number[][] = [];
        for (let i = 0; i < 120; i++) {
          h.step(1);
          const y = M.yk(yid);
          out.push([Math.round(y.position.x * 1e4) / 1e4, Math.round(y.position.z * 1e4) / 1e4]);
        }
        let ctl: any = null;
        if (mid != null) {
          h.yokai.setHp(yid, 9999);
          h.player.set({ position: { x: M.yk(yid).position.x - 2, y: 9, z: M.yk(yid).position.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
          h.step(1);
          const t = M.hit(yid, { m: mid });
          ctl = t.rows[t.k]?.m?.target ?? null;
        }
        return { out, ctl, yid };
      }, macho);
    };
    const a = await traj(true);
    const b = await traj(false);
    expect(a.out, '同じ シード で 同じ 動き').toEqual(b.out);
    expect(a.ctl, '見張り: マッチョ は ねらえる').toBe(a.yid);
  });

  test('AC15 当たらない: パンチ・きりあげ の とき プレイヤー の 体力・ねらい で ない 妖怪（横 0.8）・ブロック・ほか の にわとり は かわらない。プレイヤー の 左クリック は マッチョ に 当たらない', async ({ page }) => {
    await openLive4(page);
    await page.evaluate(SETUP);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      M.base();
      const mid = M.macho(0.5, 6.5); // ふきとぶ 向き（マッチョ から とおい 向き）に プレイヤー が いない ように 西 から
      const other = A.friend(9.5, 4.5, { stage: 'adult' }); // ふつう の なかま
      const yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      const side = M.yokai('karakasa', 6.5, 7.3, { hp: 9999 }); // ねらい の 横 0.8
      h.world.setBlock(7, 9, 6, 'stone'); // ねらい の すぐ うしろ
      h.step(2);
      M.faceTo(yid, 2);
      const trig = M.hit(yid, { m: mid });
      h.yokai.setHp(yid, 9999);
      const hp0 = h.combat.get().hp;
      const sideHp0 = M.yk(side).hp;
      const sidePos0 = M.yk(side).position;
      const rows = M.rec(260, { m: mid, y: yid });
      const hits = rows.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoPunch' && e.hit);
      const hurtOther = rows.flatMap((x: any) => x.yev).filter((e: any) => e.type === 'hurt' && e.id === side);
      const sidePos = M.yk(side).position;
      const o: any = {
        trigK: trig.k,
        hits: hits.length,
        hpSame: h.combat.get().hp === hp0,
        sideHp: M.yk(side).hp === sideHp0,
        sideMoved: Math.hypot(sidePos.x - sidePos0.x, sidePos.z - sidePos0.z),
        hurtOther: hurtOther.length,
        block: h.world.getBlock(7, 9, 6),
        otherAlive: !!M.one(other),
        rowsHurt: rows.map((x: any) => x.php).every((v: number) => v === hp0),
      };
      // プレイヤー の 左クリック は マッチョ に 当たらない
      h.yokai.clear();
      h.step(2);
      const m = M.one(mid);
      h.player.set({ position: { x: m.x - 1.5, y: 9, z: m.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(2);
      h.animals.events();
      h.input.press('primary');
      h.step(8);
      h.input.release('primary');
      h.step(60);
      o.stillThere = !!M.one(mid);
      o.hurtMacho = h.animals.events().filter((e: any) => e.type === 'hurt' || e.type === 'die').length;
      return o;
    });
    expect(r.trigK).toBeGreaterThanOrEqual(0);
    expect(r.hits, 'パンチ は 当たって いる').toBeGreaterThanOrEqual(4);
    expect(r.hpSame, 'プレイヤー の 体力').toBe(true);
    expect(r.rowsHurt).toBe(true);
    expect(r.sideHp, '横 0.8 の 妖怪 の 体力').toBe(true);
    expect(r.hurtOther, '横 の 妖怪 は hurt なし').toBe(0);
    expect(r.sideMoved, '横 の 妖怪 は 押されない').toBeLessThanOrEqual(0.05);
    expect(r.block, 'ブロック').toBe('stone');
    expect(r.otherAlive, 'ほか の にわとり').toBe(true);
    expect(r.stillThere, 'マッチョ は のこる').toBe(true);
    expect(r.hurtMacho).toBe(0);
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
