import { test, expect } from '@playwright/test';
import { openGasha, setupBoss } from './helpers/gasha';
import { TUNE } from '../src/proto/gashaBigTuning';

/**
 * #293 怒り → 攻撃を 3〜5 回 → つかれて 休む（くるくる目・30〜40 秒）→ また 怒りの ならし、の くり返し。
 * 数は 調整表（gashaBigTuning.ts の attack・tired）どおりか を ゲームに 聞く。時間では 待たず、コマで 進める。
 */
test.describe.configure({ timeout: 300_000 });

const A = TUNE.attack;
const TI = TUNE.tired;
const NAMES = A.table.map((r) => r.name);

interface Cycle {
  /** 休みに はいった とき までに 出した 攻撃の 名前（出た じゅん） */
  attacks: string[];
  doneAtTired: number;
  /** 休みに はいった ときの のこり（調整表の 秒） */
  tiredLeft: number;
  /** 休みの 間 コマ数 */
  tiredFrames: number;
  swirlDuring: boolean;
  swirlSpins: boolean;
  swirlBeforeTired: boolean;
  swirlAfterTired: boolean;
  /** 休みの あと 次の 攻撃が 出るまでに 出した 攻撃の 数 */
  nextAttackStarted: boolean;
  phaseAfter: string;
  doneAfter: number;
}

/** 1 サイクルを 最後まで 見る（怒らせる → 攻撃 × n → 休む → 立ち上がる → 次の 攻撃） */
async function watchCycle(page: import('@playwright/test').Page, tune: unknown): Promise<Cycle> {
  return page.evaluate(({ tune, exitSec }) => {
    const gt = (window as any).__gt, g = gt.big(), h = gt.h;
    if (tune) g.tune(tune);
    const swirlOf = (): { visible: boolean; z: number } => {
      let v = false, z = 0;
      g.group.traverse((o: any) => {
        if (o.name === 'swirlL') {
          let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) vis = false;
          v = vis; z = o.rotation.z;
        }
      });
      return { visible: v, z };
    };
    const stand = () => { gt.put(64.5, 64.5); gt.heal(); };
    const out: any = { attacks: [], swirlDuring: true, swirlSpins: false, swirlBeforeTired: false, swirlAfterTired: false, nextAttackStarted: false };
    g.hit(); // 怒らせる（サイクルが はじまる）
    let prevMode = '';
    let inTired = false;
    let z0 = 0;
    for (let f = 0; f < 30000; f++) {
      stand();
      h.step(1);
      const a = g.attackInfo();
      if (a.mode === 'attack' && prevMode !== 'attack' && a.attack && !inTired) out.attacks.push(a.attack);
      if (!inTired && a.phase !== 'tired' && swirlOf().visible) out.swirlBeforeTired = true;
      if (a.phase === 'tired' && !inTired) {
        inTired = true;
        out.doneAtTired = a.done; out.tiredLeft = a.left; out.tiredFrames = 0;
        // 休みの なかみ（立ち上がる まで すこし かかる ので、姿勢が 整った ころ）で 目を 見る
      }
      if (inTired) {
        if (a.phase === 'tired') {
          out.tiredFrames++;
          if (out.tiredFrames === 120) { const s = swirlOf(); z0 = s.z; if (!s.visible) out.swirlDuring = false; }
          if (out.tiredFrames === 150) { const s = swirlOf(); if (!s.visible) out.swirlDuring = false; if (Math.abs(s.z - z0) > 0.05) out.swirlSpins = true; }
        } else {
          out.phaseAfter = a.phase; out.doneAfter = a.done;
          // 立ち上がり(exitSec)が おわった あと に 目が もどる
          gt.run(Math.ceil(exitSec * 60) + 30, stand);
          out.swirlAfterTired = swirlOf().visible;
          // 次の 攻撃が 出る まで
          for (let k = 0; k < 2400; k++) { stand(); h.step(1); if (g.attackInfo().mode === 'attack') { out.nextAttackStarted = true; break; } }
          return out;
        }
      }
      prevMode = a.mode;
    }
    return out;
  }, { tune, exitSec: TI.exitSec }) as Promise<Cycle>;
}

test.describe('攻撃サイクル', () => {
  test('既定: 攻撃は 3〜5 回で 休む。休みは 30〜40 秒・くるくる目。休みの あと また 攻撃', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const c = await watchCycle(page, null);
    expect(c.attacks.length, '休むまでに 出した 攻撃').toBeGreaterThanOrEqual(A.minCount);
    expect(c.attacks.length).toBeLessThanOrEqual(A.maxCount);
    expect(c.doneAtTired).toBe(c.attacks.length);
    for (const n of c.attacks) expect(NAMES).toContain(n);
    expect(c.tiredLeft).toBeGreaterThanOrEqual(TI.restSec[0]);
    expect(c.tiredLeft).toBeLessThanOrEqual(TI.restSec[1]);
    // 休みの 長さ（コマ）が 調整表の 秒に 合う（1 秒 = 60 コマ）
    expect(c.tiredFrames).toBeGreaterThanOrEqual(Math.floor(TI.restSec[0] * 60) - 2);
    expect(c.tiredFrames).toBeLessThanOrEqual(Math.ceil(TI.restSec[1] * 60) + 2);
    expect(c.swirlBeforeTired, '休む 前は 赤い 目').toBe(false);
    expect(c.swirlDuring, '休みの 間は くるくる目').toBe(true);
    expect(c.swirlSpins, 'くるくる目は 回る').toBe(true);
    expect(c.swirlAfterTired, '休みの あとは 赤い 目').toBe(false);
    expect(c.phaseAfter).toBe('gap');
    expect(c.doneAfter).toBe(0);
    expect(c.nextAttackStarted, '休みの あと また 攻撃を はじめる').toBe(true);
    expect(errs).toEqual([]);
  });

  test('休む くじが 毎回 当たる とき（restChance 1）は ちょうど minCount 回で 休む', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const c = await watchCycle(page, { attack: { restChance: 1 } });
    expect(c.attacks.length).toBe(A.minCount);
    expect(errs).toEqual([]);
  });

  test('休む くじが 1 回も 当たらない とき（restChance 0）でも maxCount 回目の あとは 必ず 休む', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const c = await watchCycle(page, { attack: { restChance: 0 } });
    expect(c.attacks.length).toBe(A.maxCount);
    expect(errs).toEqual([]);
  });

  test('調整表を かえると 回数も 休みの 長さも かわる（minCount 2・maxCount 2・休み 5〜6 秒）', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const c = await watchCycle(page, { attack: { minCount: 2, maxCount: 2, restChance: 1 }, tired: { restSec: [5, 6] } });
    expect(c.attacks.length).toBe(2);
    expect(c.tiredLeft).toBeGreaterThanOrEqual(5);
    expect(c.tiredLeft).toBeLessThanOrEqual(6);
    expect(c.tiredFrames).toBeGreaterThanOrEqual(5 * 60 - 2);
    expect(c.tiredFrames).toBeLessThanOrEqual(6 * 60 + 2);
    expect(errs).toEqual([]);
  });

  test('攻撃の 表にある 5 種類が ぜんぶ 出る（サイクルを くり返すと どれも 出番が ある）', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    // 休みを みじかく、1 サイクル 5 回に して 速く くり返す
    const seen = await page.evaluate(() => {
      const gt = (window as any).__gt, g = gt.big(), h = gt.h;
      g.tune({ attack: { minCount: 5, maxCount: 5 }, tired: { restSec: [0.5, 0.5] } });
      g.hit();
      const names = new Set<string>();
      let prev = '';
      for (let f = 0; f < 60000 && names.size < 5; f++) {
        gt.put(64.5, 64.5); gt.heal(); h.step(1);
        const a = g.attackInfo();
        if (a.mode === 'attack' && prev !== 'attack' && a.attack) names.add(a.attack);
        prev = a.mode;
      }
      return [...names].sort();
    });
    expect(seen).toEqual([...NAMES].sort());
    expect(errs).toEqual([]);
  });
});
