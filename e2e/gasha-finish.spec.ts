import { test, expect, type Page } from '@playwright/test';
import { openGasha, reopenGasha, setupBoss, installGirlTools, loadGirl, leftovers, bare, CLEAN } from './helpers/gasha';
import { RELEASE } from '../src/gasha/releaseTuning';
import { TUNE as BT } from '../src/proto/gashaBigTuning';

/**
 * #293 段 5: とどめ（体力 0 の 一撃）→ はじく → 少女は 座りこむ（無敵）→ 大きな 姿が 倒れる → 赤い コア → 8 回 たたく たびに ばらまく → こわすと くずれて 消える → 保存 v2。
 * 既存の gashaFinish.spec.ts（一本道の 流れ）と だぶらない よう、境目・各場面での とどめ・ドロップの 中身・途中の 片づけ・保存を 見る。
 * 時間では 待たず、コマで 進める。
 */
test.describe.configure({ timeout: 300_000 });

const CORE = BT.finish.core;
const RARE = RELEASE.reward.rare;

/** コアを たたく 回数・間かくを 小さくする（とどめの 前に 呼ぶ） */
async function quickCore(page: Page, hits: number, gap = 0.1): Promise<void> {
  await page.evaluate(({ hits, gap }) => { const c = (window as any).__rikkun.gasha.bigTune.finish.core; c.hits = hits; c.hitGapSec = gap; }, { hits, gap });
}

async function ready(page: Page, o: { distance?: number; girl?: boolean } = {}): Promise<string[]> {
  const errs = await openGasha(page);
  await installGirlTools(page);
  await setupBoss(page, { distance: o.distance ?? 60 });
  if (o.girl) await loadGirl(page);
  return errs;
}

/** 攻撃を 止める（とどめを 見る とき、次の 攻撃が 割りこまない ように） */
async function quiet(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__gashaBig.tune({ attack: { gapSec: [1e6, 1e6], firstGapSec: 1e6 } }));
}

/** 終わりの 相: 'blow' | 'fall' | 'lie' | 'crumble' | 'gone' に なるまで 1 コマずつ。見つかれば かかった コマ、なければ -1 */
const untilPhase = (page: Page, phase: string, max = 1500) =>
  page.evaluate(({ phase, max }) => { const w = window as any, gt = w.__gt; return gt.until(() => w.__gashaBig.finishInfo().phase === phase, max, () => gt.heal()) as number; }, { phase, max });

const info = (page: Page) => page.evaluate(() => (window as any).__rikkun.gasha.info() as { state: string; form: string; kills: number });

/** 落ちている 袋（ドロップ）の 一覧: id と 中身 */
const bags = (page: Page) => page.evaluate(() => ((window as any).__rikkun.combat.bags() as { id: number; slots: { item: string; count: number }[] }[]).map((b) => ({ id: b.id, slots: b.slots.map((s) => ({ item: s.item, count: s.count })) })));

test.describe('とどめの 直後', () => {
  test('体力まんたんから 1 撃で とどめ（少女は 呼ばれて いない）→ 倒れて コア → こわすと 実績 1 回 → 消える', async ({ page }) => {
    const errs = await ready(page);
    await quiet(page);
    await quickCore(page, 2);
    const pre = await page.evaluate(() => ({ girl: typeof (window as any).__gashaGirl, ach: (window as any).__rikkun.achievements.stats()['defeat:gashadokuro'] ?? 0, kills: (window as any).__rikkun.gasha.info().kills }));
    expect(pre.girl, '少女の 3D は まだ 読んで いない').toBe('undefined');
    await page.evaluate(() => { (window as any).__rikkun.gasha.defeat(); (window as any).__rikkun.step(2); });
    expect((await info(page)).form).toBe('down');
    expect(await untilPhase(page, 'lie'), '倒れきる').toBeGreaterThan(0);
    const mid = await page.evaluate(() => { const w = window as any; w.__rikkun.achievements.flush(); return { ach: w.__rikkun.achievements.stats()['defeat:gashadokuro'] ?? 0, kills: w.__rikkun.gasha.info().kills, state: w.__rikkun.gasha.info().state, hp: w.__gashaBig.hp() }; });
    expect(mid.hp).toBe(0);
    expect(mid.state, 'コアを こわす まで は 倒れた だけ').toBe('present');
    expect(mid.kills, 'こわす まで 数えない').toBe(pre.kills);
    expect(mid.ach, 'こわす まで 実績は つかない').toBe(pre.ach);
    await page.evaluate(() => { const w = window as any; for (let k = 0; k < 2; k++) { w.__gashaBig.damage('core', 1e6); w.__rikkun.step(30); } w.__rikkun.achievements.flush(); w.__rikkun.step(2); });
    const post = await page.evaluate(() => { const w = window as any; return { ach: w.__rikkun.achievements.stats()['defeat:gashadokuro'] ?? 0, kills: w.__rikkun.gasha.info().kills, state: w.__rikkun.gasha.info().state }; });
    expect(post.state).toBe('defeated');
    expect(post.kills).toBe(pre.kills + 1);
    expect(post.ach, '実績は ちょうど 1 回').toBe(pre.ach + 1);
    // こわれた あとの 余分な 一撃は 数えない
    await page.evaluate(() => { const w = window as any; for (let k = 0; k < 5; k++) { w.__gashaBig.damage('core', 1e6); w.__rikkun.step(30); } w.__rikkun.achievements.flush(); });
    expect((await info(page)).kills).toBe(pre.kills + 1);
    const st = await page.evaluate(() => { const w = window as any; return w.__gt.until(() => w.__rikkun.gasha.state() === 'idle', 1500, () => w.__gt.heal()) as number; });
    expect(st, 'くずれて 消える').toBeGreaterThan(0);
    expect(errs).toEqual([]);
  });

  test('倒れおわる まで コアは たたけない。たたける ように なっても 間かく（hitGapSec）の 中の 2 回目は 数えない', async ({ page }) => {
    const errs = await ready(page);
    await quiet(page);
    await quickCore(page, 4, 0.3);
    const r = await page.evaluate(() => {
      const w = window as any, gt = w.__gt, g = gt.big();
      const o: any = {};
      w.__rikkun.gasha.defeat();
      w.__rikkun.step(2);
      o.blow = g.finishInfo().phase; g.damage('core', 1e6); o.coreAtBlow = g.finishInfo().coreHp;
      gt.until(() => g.finishInfo().phase === 'fall', 600, () => gt.heal());
      g.damage('core', 1e6); o.coreAtFall = g.finishInfo().coreHp;
      gt.until(() => g.finishInfo().phase === 'lie', 900, () => gt.heal());
      o.lie = g.finishInfo().phase;
      g.damage('core', 1e6); g.damage('core', 1e6); // 同じ コマの 2 回目
      o.afterTwo = g.finishInfo().coreHp;
      gt.run(Math.ceil(0.15 * 60), () => gt.heal()); g.damage('core', 1e6); // 間かくの 半分
      o.halfGap = g.finishInfo().coreHp;
      gt.run(Math.ceil(0.3 * 60) + 2, () => gt.heal()); g.damage('core', 1e6); // 間かくが あいた
      o.afterGap = g.finishInfo().coreHp;
      return o;
    });
    expect(r.blow).toBe('blow');
    expect(r.coreAtBlow, 'とどめの 一撃の 最中は 数えない').toBe(4);
    expect(r.coreAtFall, '倒れる 間は 数えない').toBe(4);
    expect(r.lie).toBe('lie');
    expect(r.afterTwo, '同じ コマの 2 回は 1 回').toBe(3);
    expect(r.halfGap, '間かくの 途中は 数えない').toBe(3);
    expect(r.afterGap, '間かくが あけば 数える').toBe(2);
    expect(errs).toEqual([]);
  });

  test('少女と 体は とどめの あと 無敵: コア以外には 何を しても 体力も コアも かわらない', async ({ page }) => {
    const errs = await ready(page, { girl: true });
    await quickCore(page, 5);
    await page.evaluate(() => { const gg = (window as any).__gg; gg.hpTo(0.3); (window as any).__gashaGirl.tune({ eye: { turnsPerShow: 1, bigWaitSec: 600 }, timing: { goneSec: 0.2 } }); });
    await page.evaluate(() => { const w = window as any; w.__gg.untilForm('perch'); w.__gt.until(() => w.__gashaGirl.phase() === 'perch', 900, () => w.__gt.heal()); w.__rikkun.gasha.defeat(); });
    expect(await untilPhase(page, 'lie')).toBeGreaterThan(0);
    const r = await page.evaluate(() => {
      const w = window as any, g = w.__gashaBig;
      const o: any = { hp0: g.hp(), core0: g.finishInfo().coreHp };
      o.dealt = ['girl', 'head', 'hand', 'body', 'foreArm', 'upperArm'].map((p) => g.damage(p, 1e6));
      w.__rikkun.step(30);
      o.hp1 = g.hp(); o.core1 = g.finishInfo().coreHp; o.phase = g.finishInfo().phase; o.girl = w.__gashaGirl.phase(); o.state = w.__rikkun.gasha.state();
      return o;
    });
    expect(r.dealt).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.hp1).toBe(r.hp0);
    expect(r.core1).toBe(r.core0);
    expect(r.phase).toBe('lie');
    expect(r.girl, '少女は 座りこんだ まま').toBe('down');
    expect(r.state).toBe('present');
    expect(errs).toEqual([]);
  });
});

test.describe('コアの ドロップ', () => {
  test('コアを たたく たびに レア素材を ばらまく（量は 調整表）。こわすと 大きな 一山（忍者装備 1 つ ＋ レア素材。NINJA-1 で 足袋ぴったり から かわった）', async ({ page }) => {
    const errs = await ready(page);
    await quiet(page);
    await quickCore(page, CORE.hits, CORE.hitGapSec);
    await page.evaluate(() => (window as any).__rikkun.gasha.defeat());
    expect(await untilPhase(page, 'lie')).toBeGreaterThan(0);
    const seen = new Set((await bags(page)).map((b) => b.id));
    expect(seen.size, 'たたく 前は 何も おちて いない').toBe(0);
    const perHit: Record<string, number>[] = [];
    for (let k = 0; k < CORE.hits - 1; k++) {
      await page.evaluate((gapFrames) => { const w = window as any; w.__gashaBig.damage('core', 1e6); w.__gt.run(gapFrames, () => w.__gt.heal()); }, Math.ceil(CORE.hitGapSec * 60) + 3);
      const now = await bags(page);
      const fresh = now.filter((b) => !seen.has(b.id));
      for (const b of now) seen.add(b.id);
      const sum: Record<string, number> = {};
      for (const b of fresh) for (const s of b.slots) sum[s.item] = (sum[s.item] ?? 0) + s.count;
      perHit.push(sum);
      expect((await page.evaluate(() => (window as any).__gashaBig.finishInfo().coreHp as number)), `${k + 1} 回目`).toBe(CORE.hits - 1 - k);
    }
    for (const [i, sum] of perHit.entries()) {
      for (const row of RARE) {
        const lo = Math.max(1, Math.round(row.min * RELEASE.core.hitScale)), hi = Math.max(1, Math.round(row.max * RELEASE.core.hitScale));
        expect(sum[row.item] ?? 0, `${i + 1} 回目の ${row.item}`).toBeGreaterThanOrEqual(lo);
        expect(sum[row.item] ?? 0, `${i + 1} 回目の ${row.item}`).toBeLessThanOrEqual(hi);
      }
    }
    expect((await info(page)).kills).toBe(0);
    // 最後の 一撃: こわれる → 大きな 一山
    await page.evaluate((gapFrames) => { const w = window as any; w.__gashaBig.damage('core', 1e6); w.__gt.run(gapFrames, () => w.__gt.heal()); }, Math.ceil(CORE.hitGapSec * 60) + 3);
    const now = await bags(page);
    const big: Record<string, number> = {};
    for (const b of now.filter((b) => !seen.has(b.id))) for (const s of b.slots) big[s.item] = (big[s.item] ?? 0) + s.count;
    for (const g of RELEASE.reward.guaranteed) expect(big[g.item] ?? 0, 'かならず 入る もの ' + g.item).toBeGreaterThanOrEqual(g.count);
    const ninja = Object.entries(big).filter(([k]) => k.startsWith('ninja_'));
    expect(ninja, '忍者装備は ちょうど 1 つ').toEqual([[ninja[0]?.[0], 1]]);
    for (const row of RARE) expect(big[row.item] ?? 0, 'レア素材 ' + row.item).toBeGreaterThanOrEqual(row.min);
    expect((await info(page)).kills).toBe(1);
    expect(errs).toEqual([]);
  });
});

test.describe('とどめの 一撃で はじく', () => {
  for (const [label, distance, pushed] of [['近く（knockRange の 中）', 28, true], ['遠く（knockRange の 外）', 60, false]] as const) {
    test(`プレイヤーが ${label} に いると ${pushed ? '体から 遠ざけて 上へ はじく（ダメージ なし）' : 'はじかれない'}`, async ({ page }) => {
      const errs = await ready(page, { distance });
      await quiet(page);
      const r = await page.evaluate(() => {
        const w = window as any, gt = w.__gt, h = gt.h, g = gt.big();
        const horiz = () => { const p = h.player.get().position, b = g.info().pos; return Math.hypot(p.x - b[0], p.z - b[2]); };
        gt.heal(); gt.drain(); gt.taken.length = 0;
        const d0 = horiz(), y0 = h.player.get().position.y, hp0 = gt.hp();
        h.gasha.defeat();
        let maxY = y0;
        for (let i = 0; i < 120; i++) { h.step(1); maxY = Math.max(maxY, h.player.get().position.y); }
        return { d0, d1: horiz(), up: maxY - y0, lost: hp0 - gt.hp() };
      });
      if (pushed) {
        expect(r.d1 - r.d0, '遠ざかる').toBeGreaterThan(3);
        expect(r.up, '上へ とびあがる').toBeGreaterThan(0.5);
      } else {
        expect(Math.abs(r.d1 - r.d0), 'はじかれない').toBeLessThan(0.5);
        expect(r.up).toBeLessThan(0.5);
      }
      expect(r.lost, 'とどめの 一撃で ダメージは うけない').toBe(0);
      expect(errs).toEqual([]);
    });
  }
});

test.describe('どの 場面で とどめを うけても', () => {
  const STAGES = ['freeze', 'laugh', 'orbit', 'pose', 'girl', 'perch'] as const;
  for (const stage of STAGES) {
    test(`${stage} で とどめ → 倒れて コア → 消える。少女は 弾も 魔法も 残さず、最後は 眠る`, async ({ page }) => {
      const errs = await ready(page, { girl: true });
      await quickCore(page, 2);
      await page.evaluate(() => { (window as any).__gashaGirl.tune({ eye: { turnsPerShow: 1, bigWaitSec: 600 }, timing: { goneSec: 0.2 } }); (window as any).__gg.hpTo(0.3); });
      const reached = await page.evaluate((s) => {
        const w = window as any, gt = w.__gt, gg = w.__gg;
        if (gg.untilForm(s, 8000) < 0) return false;
        if (s === 'perch') gt.until(() => w.__gashaGirl.phase() === 'perch', 900, () => gt.heal());
        else if (s !== 'freeze') gt.run(20, () => gt.heal());
        return true;
      }, stage);
      expect(reached, stage + ' に ついた').toBe(true);
      await page.evaluate(() => { const w = window as any; w.__gt.taken.length = 0; w.__rikkun.combat.events(); w.__rikkun.gasha.defeat(); w.__rikkun.step(2); });
      expect((await info(page)).form).toBe('down');
      const a = await page.evaluate(() => {
        const w = window as any, gt = w.__gt, gg = w.__gg;
        gt.run(30, () => gt.heal());
        const gi = gg.girl();
        return { girl: w.__gashaGirl.phase(), shots: gi.fireballs + gi.waves + gi.vortexCount, hitActive: gi.hitActive, bgm: gg.bgm(), taken: (gt.drain(), gt.takenTotal()) };
      });
      expect(a.shots, '魔法・弾は 消える').toBe(0);
      expect(a.hitActive).toBe(false);
      expect(a.bgm.desired, '戦いの 曲は 止まる').toBeNull();
      expect(a.bgm.cut).toBe(false);
      if (stage !== 'freeze') expect(a.girl, '少女は 座りこむ').toBe('down');
      expect(await untilPhase(page, 'lie')).toBeGreaterThan(0);
      const takenBefore = await page.evaluate(() => { const gt = (window as any).__gt; gt.drain(); return gt.takenTotal() as number; });
      await page.evaluate(() => { const w = window as any; for (let k = 0; k < 2; k++) { w.__gashaBig.damage('core', 1e6); w.__rikkun.step(30); } });
      const b = await page.evaluate(() => { const w = window as any; return { girl: w.__gashaGirl.phase(), kills: w.__rikkun.gasha.info().kills, form: w.__rikkun.gasha.info().form }; });
      expect(b.kills).toBe(1);
      expect(b.form).toBe('crumble');
      if (stage !== 'freeze') expect(b.girl, '少女も くずれる').toBe('crumble');
      const gone = await page.evaluate(() => { const w = window as any; return w.__gt.until(() => w.__rikkun.gasha.state() === 'idle', 1500, () => w.__gt.heal()) as number; });
      expect(gone, '消える').toBeGreaterThan(0);
      const z = await page.evaluate(() => {
        const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
        gt.run(30, () => gt.heal()); gt.drain();
        return { girl: w.__gashaGirl.phase(), vis: w.__gashaGirl.figures[0].visible, bgm: gg.bgm(), bar: gg.barShown(), frozen: g.frozen(), colliders: g.colliders().length, fin: g.finishInfo(), taken: gt.takenTotal() as number };
      });
      expect(z.girl, '少女は 眠る').toBe('dormant');
      expect(z.vis, '少女の 姿は 消える').toBe(false);
      expect(z.bgm.cut).toBe(false);
      expect(z.bgm.desired).toBeNull();
      expect(z.bar).toBe(false);
      expect(z.frozen).toBe(false);
      expect(z.colliders).toBe(0);
      expect(z.fin.phase).toBe('off');
      expect(z.fin.chunks, 'かけらは のこらない').toBe(0);
      expect(z.taken, 'とどめの あと プレイヤーは ダメージを うけない').toBe(takenBefore);
      expect(bare(await leftovers(page))).toEqual(CLEAN);
      expect(errs).toEqual([]);
    });
  }
});

test.describe('とどめの 途中で 片づける（despawn）', () => {
  for (const phase of ['blow', 'fall', 'lie', 'crumble'] as const) {
    test(`${phase} の 最中に 片づけても 何も のこらず、出しなおした 体は ふつうに 戦える（こわれる前は kills も ふえない）`, async ({ page }) => {
      const errs = await ready(page);
      await quiet(page);
      await quickCore(page, 2);
      await page.evaluate(() => { const w = window as any; w.__rikkun.gasha.defeat(); w.__rikkun.step(2); });
      if (phase !== 'blow') {
        expect(await untilPhase(page, phase === 'crumble' ? 'lie' : phase)).toBeGreaterThanOrEqual(0);
        if (phase === 'crumble') await page.evaluate(() => { const w = window as any; for (let k = 0; k < 2; k++) { w.__gashaBig.damage('core', 1e6); w.__rikkun.step(30); } });
      }
      const kills = (await info(page)).kills;
      expect(kills).toBe(phase === 'crumble' ? 1 : 0);
      await page.evaluate(() => (window as any).__rikkun.gasha.despawn());
      const r = await page.evaluate(() => {
        const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
        gt.run(30, () => gt.heal());
        return { state: w.__rikkun.gasha.state(), fin: g.finishInfo(), colliders: g.colliders().length, bar: gg.barShown(), bgm: gg.bgm(), kills: w.__rikkun.gasha.info().kills, bags: w.__rikkun.combat.bags().length };
      });
      expect(r.state).toBe('idle');
      expect(r.fin.phase).toBe('off');
      expect(r.fin.chunks).toBe(0);
      expect(r.colliders).toBe(0);
      expect(r.bar).toBe(false);
      expect(r.bgm.desired).toBeNull();
      expect(r.kills).toBe(kills);
      expect(bare(await leftovers(page))).toEqual(CLEAN);
      // 出しなおすと まっさらな 体: 体力 まんたん・ふつうに ダメージが 入る・コアは まだ たたけない
      const again = await page.evaluate(async () => {
        const w = window as any, gt = w.__gt, g = gt.big();
        const ok = await w.__rikkun.gasha.spawn({ distance: 60, angleDeg: -90 });
        g.walk(false); gt.put(64.5, 64.5); gt.heal();
        const o: any = { ok, hp: g.hp(), max: g.maxHp(), fin: g.finishInfo().phase, frozen: g.frozen() };
        o.hit = g.damage('head', 100);
        o.hpAfter = g.hp();
        o.coreHit = g.damage('core', 1);
        o.finAfterCore = g.finishInfo().phase;
        o.colliders = g.colliders().length;
        return o;
      });
      expect(again.ok).toBe(true);
      expect(again.hp).toBe(again.max);
      expect(again.fin).toBe('off');
      expect(again.frozen).toBe(false);
      expect(again.hit, 'ふつうに ダメージ').toBeGreaterThan(0);
      expect(again.hpAfter).toBe(again.max - again.hit);
      expect(again.finAfterCore, 'コアの 一撃で とどめの 流れは はじまらない').toBe('off');
      expect(again.colliders).toBeGreaterThan(0);
      expect(errs).toEqual([]);
    });
  }
});

test.describe('たおした 数の 保存（v2）', () => {
  test('こわすと たおした 数が ふえ、保存して 開きなおしても のこる。2 体目で 2。ボス本体は 保存しない', async ({ page }) => {
    const errs = await ready(page);
    await quiet(page);
    await quickCore(page, 1);
    const kill = async () => {
      await page.evaluate(() => (window as any).__rikkun.gasha.defeat());
      expect(await untilPhase(page, 'lie')).toBeGreaterThanOrEqual(0);
      await page.evaluate(() => { const w = window as any; w.__gashaBig.damage('core', 1e6); w.__rikkun.step(30); });
      const gone = await page.evaluate(() => { const w = window as any; return w.__gt.until(() => w.__rikkun.gasha.state() === 'idle', 1500, () => w.__gt.heal()) as number; });
      expect(gone).toBeGreaterThan(0);
    };
    await kill();
    expect((await info(page)).kills).toBe(1);
    await page.evaluate(() => (window as any).__rikkun.save.now());
    await reopenGasha(page);
    await installGirlTools(page);
    const after = await info(page);
    expect(after.kills, '開きなおしても 1').toBe(1);
    expect(after.state, 'ボスは 保存しない').toBe('idle');
    // 2 体目
    await setupBoss(page);
    await quiet(page);
    await quickCore(page, 1);
    await kill();
    expect((await info(page)).kills).toBe(2);
    await page.evaluate(() => (window as any).__rikkun.save.now());
    await reopenGasha(page);
    expect((await info(page)).kills).toBe(2);
    expect(errs).toEqual([]);
  });
});

test.describe('置いた ブロック', () => {
  test('少女への きりかえ（噴火）から とどめ・くずれて 消える まで、プレイヤーの 置いた ブロックと 掘った 穴は 1 つも かわらない', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    const SNAP = `(x0, x1, y0, y1, z0, z1) => { const h = window.__rikkun; const out = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) out.push(h.world.getBlock(x, y, z)); return out.join(','); }`;
    // 体が 立つ 場所の まわり（手・足の とどく 範囲）に、家・台・掘った 穴を 置く
    const box = await page.evaluate(() => {
      const gt = (window as any).__gt, h = gt.h;
      const base = gt.groundTop(64, 4);
      h.world.fill(36, base, 24, 46, base + 6, 36, 'brick');
      h.world.fill(80, base, 20, 90, base + 2, 30, 'stone');
      h.world.setBlock(64, base, 20, 'torch');
      h.world.fill(60, base - 3, 30, 62, base - 1, 34, 'air');
      return [10, 120, base - 6, base + 14, -30, 60] as number[];
    });
    const snap = () => page.evaluate(({ src, b }) => (eval(src) as (...a: number[]) => string)(...b), { src: SNAP, b: box });
    const before = await snap();
    await setupBoss(page);
    await loadGirl(page);
    await quickCore(page, 2);
    await page.evaluate(() => { (window as any).__gashaGirl.tune({ eye: { turnsPerShow: 1, bigWaitSec: 600 }, timing: { goneSec: 0.2 } }); (window as any).__gg.hpTo(0.3); });
    await page.evaluate(() => { const w = window as any; w.__gg.untilForm('perch'); w.__gt.until(() => w.__gashaGirl.phase() === 'perch', 900, () => w.__gt.heal()); w.__rikkun.gasha.defeat(); });
    expect(await untilPhase(page, 'lie')).toBeGreaterThan(0);
    await page.evaluate(() => { const w = window as any; for (let k = 0; k < 2; k++) { w.__gashaBig.damage('core', 1e6); w.__rikkun.step(30); } });
    const gone = await page.evaluate(() => { const w = window as any; return w.__gt.until(() => w.__rikkun.gasha.state() === 'idle', 1500, () => w.__gt.heal()) as number; });
    expect(gone).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__rikkun.step(30));
    const after = await snap();
    // ちがう ブロックを 数える（何から 何に かわったか）。噴火で 草・花・葉が 燃えて 空気に なるのは 仕様（gasha-embers の「植物が 燃える」）。それ以外は 1 つも かわらない
    const BURNS = new Set(['kusa', 'nobana', 'leaves']);
    const A = before.split(','), B = after.split(',');
    const [x0, x1, y0, y1, z0, z1] = box as [number, number, number, number, number, number];
    const diffs: Record<string, number> = {};
    const samples: string[] = [];
    let i = 0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++, i++) {
      if (A[i] !== B[i] && !(BURNS.has(A[i]!) && B[i] === 'air')) { const k = `${A[i]}->${B[i]}`; diffs[k] = (diffs[k] ?? 0) + 1; if (samples.length < 6) samples.push(`(${x},${y},${z}) ${k}`); }
    }
    expect(diffs, '置いた ブロックと 穴は そのまま（燃える 植物は のぞく）。ちがい: ' + samples.join(' / ')).toEqual({});
    expect(errs).toEqual([]);
  });
});
