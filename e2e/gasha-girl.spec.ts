import { test, expect, type Page } from '@playwright/test';
import { openGasha, setupBoss, installGirlTools, loadGirl, leftovers, bare, CLEAN } from './helpers/gasha';
import { takeKatana, runTech, settle } from './helpers/blade';
import { TUNE as GT } from '../src/proto/gashaGirlTuning';
import { TUNE as BT } from '../src/proto/gashaBigTuning';
import { RELEASE } from '../src/gasha/releaseTuning';

/**
 * #293 段 4: 体力 1/2 → 噴火 → 固まる → 笑う → ワープ 5 回 → 決めポーズ → 魔法 → 5 回の あと 肩に 座って 休む（座った 少女は 大ダメージ）。
 * 既存の gashaGirlIntro.spec.ts（正しい 流れの 順番）と だぶらない よう、境目・固まって いる 間・座った 少女の 当たり・途中の 片づけを 見る。
 * 時間では 待たず、コマで 進める。体力は 'girl' 部位（倍率 5・防御 0）で 正確に 下げる。
 */
test.describe.configure({ timeout: 240_000 });

/** 少女の 戦いを 早送りする 設定（5 回 → 1 回、休みを 長く して 座った まま にする） */
const FAST = { eye: { turnsPerShow: 1, bigWaitSec: 600 }, timing: { goneSec: 0.2 } };

async function ready(page: Page, fast = true): Promise<string[]> {
  const errs = await openGasha(page);
  await installGirlTools(page);
  await setupBoss(page);
  await loadGirl(page);
  if (fast) await page.evaluate((t) => (window as any).__gashaGirl.tune(t), FAST);
  return errs;
}

/** 少女が 肩に 座り おわる まで（form が perch で、少女の 場面も perch） */
async function untilSeated(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const w = window as any, gt = w.__gt;
    if (w.__gg.untilForm('perch') < 0) return false;
    return gt.until(() => w.__gashaGirl.phase() === 'perch', 900, () => gt.heal()) >= 0;
  });
  expect(ok, '肩に 座る').toBe(true);
}

test.describe('切りかえの 境目', () => {
  test('体力が 切りかえの 体力（調整表 girl.hpFraction = 1/2）より 上の 間は 固まらない。きった ところで 噴火を 出して から 固まる', async ({ page }) => {
    const errs = await ready(page, false);
    const r = await page.evaluate((F) => {
      const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
      const out: any = {};
      gt.run(120, () => gt.heal());
      out.at55 = { form: gg.form(), frozen: g.frozen(), girl: w.__gashaGirl.phase() };
      gg.hpTo(F + 0.004); // 切りかえの 体力の すぐ 上
      gt.run(120, () => gt.heal());
      out.above = { form: gg.form(), frozen: g.frozen(), hp: g.hp() };
      g.damage('girl', 1); // 5 へらして 切りかえの 体力より 下へ
      gt.run(3, () => gt.heal());
      out.cut = { form: gg.form(), hp: g.hp(), max: g.maxHp() };
      out.afterCut = { mode: g.attackInfo().mode, attack: g.attackInfo().attack, frozen: g.frozen() };
      const n = gt.until(() => g.frozen(), 1500, () => gt.heal());
      out.heldAt = n;
      out.held = { form: gg.form(), mode: g.attackInfo().mode, eruptions: g.attackInfo().eruption.count };
      return out;
    }, RELEASE.girl.hpFraction);
    expect(r.at55, '切りかえより ずっと 上').toEqual({ form: 'big', frozen: false, girl: 'dormant' });
    expect(r.above.form, '切りかえの すぐ 上').toBe('big');
    expect(r.above.frozen).toBe(false);
    expect(r.cut.hp).toBeLessThanOrEqual(r.cut.max * RELEASE.girl.hpFraction);
    expect(r.cut.form).toBe('freeze');
    expect(r.afterCut.attack, '切りかえは 必ず 噴火').toBe('eruption');
    expect(r.afterCut.mode).toBe('attack');
    expect(r.afterCut.frozen, '噴火が おわる まで 固まらない').toBe(false);
    expect(r.heldAt, '噴火が おわると 固まる').toBeGreaterThan(0);
    expect(r.held.mode).toBe('frozen');
    expect(r.held.eruptions).toBeGreaterThanOrEqual(1);
    expect(errs).toEqual([]);
  });

  test('少女は 1 回だけ 呼ぶ: 体力を さらに へらしても 切りかえを やりなおさない（固まった まま・形は 順番に すすむ）', async ({ page }) => {
    const errs = await ready(page);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    const r = await page.evaluate(() => {
      const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
      const forms: string[] = [];
      let last = '';
      for (let i = 0; i < 4000; i++) {
        gt.heal();
        w.__rikkun.step(1);
        const f = gg.form();
        if (f !== last) { forms.push(f); last = f; }
        if (i === 500) g.damage('girl', 10); // とちゅうで もう 少し へらす
        if (f === 'girl') break;
      }
      return { forms, frozen: g.frozen(), hp: g.hp() };
    });
    expect(r.forms).toEqual(['freeze', 'laugh', 'orbit', 'pose', 'girl']);
    expect(r.frozen).toBe(true);
    expect(errs).toEqual([]);
  });
});

test.describe('固まって いる 間（笑い・ワープ・ポーズ）', () => {
  test('大きな 姿は 動かず 攻撃しない・プレイヤーは ダメージを うけない・BGM は 切れて いる・ゲージは 出ている', async ({ page }) => {
    const errs = await ready(page);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    const r = await page.evaluate(() => {
      const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
      const seen: Record<string, any> = {};
      let base: number[] | null = null;
      let moved = 0, jumps = 0, prev: number[] | null = null;
      let last = '';
      gt.taken.length = 0; w.__rikkun.combat.events();
      for (let i = 0; i < 5000; i++) {
        gt.heal();
        w.__rikkun.step(1);
        gt.drain();
        const f = gg.form();
        if (f !== last) { seen[f] = { bgm: gg.bgm(), bar: gg.barShown(), frozen: g.frozen(), mode: g.attackInfo().mode, taken: gt.takenTotal(), at: i }; last = f; }
        if (f === 'laugh' || f === 'orbit' || f === 'pose') {
          const q = g.info().pos as number[];
          if (!base) base = q;
          if (q.some((v, k) => Math.abs(v - base![k]!) > 1e-6)) moved++;
          if (g.attackInfo().mode !== 'frozen') moved += 1000;
          const gi = gg.girl();
          if (f === 'orbit') {
            const p = [gi.girlX as number, gi.girlZ as number];
            if (prev && Math.hypot(p[0]! - prev[0]!, p[1]! - prev[1]!) > 2) jumps++;
            prev = p;
          }
        }
        if (f === 'girl') break;
      }
      const beforeGirl = gt.takenTotal();
      return { seen, moved, jumps, beforeGirl };
    });
    for (const f of ['laugh', 'orbit', 'pose']) {
      expect(r.seen[f], f).toBeTruthy();
      expect(r.seen[f].frozen, f + ': 固まって いる').toBe(true);
      expect(r.seen[f].bar, f + ': 体力ゲージは 出ている').toBe(true);
      expect(r.seen[f].bgm.cut, f + ': BGM は 切れて いる').toBe(true);
      expect(r.seen[f].bgm.desired, f + ': 曲は 頼まれて いない').toBeNull();
    }
    expect(r.moved, '体は 1 ミリも 動かず、攻撃も しない').toBe(0);
    expect(r.beforeGirl, '笑い〜ポーズの 間は プレイヤーに ダメージ なし').toBe(0);
    expect(r.jumps, 'ワープで 飛びまわる 回数（調整表 intro.warps）').toBeGreaterThanOrEqual(GT.intro.warps - 1);
    expect(r.jumps).toBeLessThanOrEqual(GT.intro.warps + 1);
    // 戦いが はじまると BGM「災厄」を 頼む（曲を 切るのは やめる）
    expect(r.seen.girl.bgm.cut).toBe(false);
    expect(r.seen.girl.bgm.desired).toBe('saiyaku');
    expect(r.seen.girl.frozen, '戦いの 間も 大きな 姿は 固まった まま').toBe(true);
    expect(errs).toEqual([]);
  });

  test('少女の 戦い（5 回）: 立ち止まって いると 魔法に 当たる（1 発 = 調整表の ダメージ）。5 回の あと 肩に 座る', async ({ page }) => {
    const errs = await ready(page, false);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    const r = await page.evaluate(() => {
      const w = window as any, gt = w.__gt, gg = w.__gg;
      if (gg.untilForm('girl', 8000) < 0) return { ok: false } as any;
      gt.taken.length = 0; w.__rikkun.combat.events();
      const out: any = { ok: true, turnAtSeat: -1 };
      for (let i = 0; i < 20000; i++) {
        gt.heal();
        w.__rikkun.step(1);
        if (i % 5 === 0) gt.drain();
        const f = gg.form();
        if (f === 'perch') { out.turnAtSeat = gg.girl().turn; break; }
      }
      gt.drain();
      out.amounts = gt.taken.map((e: any) => e.amount);
      out.form = gg.form();
      return out;
    });
    expect(r.ok).toBe(true);
    expect(r.form, '5 回の あと').toBe('perch');
    expect(r.turnAtSeat).toBe(GT.eye.turnsPerShow);
    expect(r.amounts.length, '立ち止まった まま だと 1 回は 当たる').toBeGreaterThanOrEqual(1);
    for (const a of r.amounts) expect(a).toBe(GT.damage.heart);
    expect(errs).toEqual([]);
  });
});

test.describe('肩に 座った 少女', () => {
  test('座って いる 間は 新しい 魔法を 出さず プレイヤーを 傷つけない（飛んで いた 弾が 消えた あと）・曲は「災厄」の まま・座った 位置は 肩', async ({ page }) => {
    const errs = await ready(page);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    await untilSeated(page);
    const r = await page.evaluate((lifeFrames) => {
      const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
      const shots = () => { const gi = gg.girl(); return gi.fireballs + gi.waves + gi.vortexCount + (gi.hitActive ? 1 : 0); };
      // 座る 前に 撃った 弾は 飛びきる まで のこる（調整表の lifeSec ぶん）。のこりが 0 に なる まで 待つ
      const clearedAt = gt.until(() => shots() === 0, lifeFrames, () => gt.heal());
      gt.taken.length = 0; w.__rikkun.combat.events();
      let maxShots = 0;
      for (let i = 0; i < 600; i++) {
        gt.heal(); w.__rikkun.step(1); gt.drain();
        maxShots = Math.max(maxShots, shots());
      }
      const sp = g.perchSpot(), gi = gg.girl();
      return { clearedAt, taken: gt.takenTotal(), maxShots, bgm: gg.bgm(), form: gg.form(), dist: Math.hypot(gi.girlX - sp.x, gi.girlZ - sp.z), phase: w.__gashaGirl.phase() };
    }, Math.ceil(Math.max(GT.s3.lifeSec, GT.s4.lifeSec, GT.s2.totalSec) * 60) + 60);
    expect(r.clearedAt, '飛んで いた 弾が 消える').toBeGreaterThanOrEqual(0);
    expect(r.phase).toBe('perch');
    expect(r.form).toBe('perch');
    expect(r.taken).toBe(0);
    expect(r.maxShots, '魔法・渦・火の玉は 新しく 出ない').toBe(0);
    expect(r.bgm.desired, '座って いる 間も「災厄」(ふだんの 曲に もどさない)').toBe('saiyaku');
    expect(r.dist).toBeLessThan(0.5);
    expect(errs).toEqual([]);
  });

  test('座った 少女を 刀で 切ると「少女」の 部位で 大ダメージ（体の 部位より ずっと 大きい）', async ({ page }) => {
    const errs = await ready(page);
    await takeKatana(page, 'chudan');
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    await untilSeated(page);
    await page.evaluate(() => {
      const w = window as any, gt = w.__gt, h = gt.h, g = gt.big();
      gt.run(30, () => gt.heal());
      const sp = g.perchSpot(), gi = w.__gashaGirl.info();
      // 肩の 上（少女の まうしろ）に 立って、-z（少女の 方）へ 突く。登らず 置く
      h.player.set({ position: { x: gi.girlX, y: sp.y - 0.2, z: gi.girlZ + 1.8 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(1);
    });
    const hp0 = await page.evaluate(() => (window as any).__gashaBig.hp() as number);
    await runTech(page, 14);
    const r = await page.evaluate(() => { const w = window as any, g = w.__gashaBig; return { hp: g.hp() as number, last: g.info().lastHit, phase: w.__gashaGirl.phase() as string }; });
    expect(r.last?.part).toBe('girl');
    expect(r.last?.mul).toBe(BT.hit.partMul.girl);
    expect(r.last?.dealt).toBeGreaterThan(0);
    expect(hp0 - r.hp).toBeCloseTo(r.last.dealt, 5);
    expect(r.last.dealt, '体の 部位（防御 30）では 最低の 1 しか 入らない').toBeGreaterThan(1);
    expect(r.phase, '切られても 座った まま').toBe('perch');
    await settle(page, 5);
    expect(errs).toEqual([]);
  });

  test('座って いない 少女は 切れない: 笑って いる 間に 同じ 場所を 突いても「少女」の 部位には 当たらない', async ({ page }) => {
    const errs = await ready(page);
    await takeKatana(page, 'chudan');
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    const f = await page.evaluate(() => (window as any).__gg.untilForm('laugh'));
    expect(f).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => {
      const w = window as any, gt = w.__gt, h = gt.h, g = gt.big();
      const sp = g.perchSpot();
      h.player.set({ position: { x: sp.x, y: sp.y - 0.2, z: sp.z + 1.8 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(1);
    });
    const hp0 = await page.evaluate(() => (window as any).__gashaBig.hp() as number);
    await runTech(page, 14);
    // lastHit には 体力を へらすのに 使った 'test' の 記録が のこるので、刀（source = blade）の 当たりだけ 見る
    const last = await page.evaluate(() => (window as any).__gashaBig.info().lastHit as { part: string; source: string } | null);
    expect(last?.source, '何にも 当たらない').not.toBe('blade');
    expect(await page.evaluate(() => (window as any).__gashaBig.hp() as number), '体力は かわらない').toBe(hp0);
    await settle(page, 5);
    expect(errs).toEqual([]);
  });
});

test.describe('プレイヤーが 遠い・やられた とき', () => {
  test('perf.farDist（80）より 遠くで 体力が 切りかえの 体力を きっても、噴火 → 固まる → 笑う … と 切りかえが すすむ（矢などで 遠くから へらす場合）', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    // 体を 東に 100 ブロック（farDist より 遠く・ゲージの 距離 barShowDistance 以内）に 置く
    await page.evaluate(async () => {
      const gt = (window as any).__gt;
      const ok = await gt.spawn({ distance: 100, angleDeg: 0 });
      if (!ok) throw new Error('出せなかった');
      gt.big().walk(false); gt.put(64.5, 64.5); gt.heal();
    });
    const far = await page.evaluate(() => { const w = window as any, b = w.__gt.boss(), p = w.__rikkun.player.get().position; return Math.hypot(b.x - p.x, b.z - p.z); });
    expect(far).toBeGreaterThan(BT.perf.farDist);
    await loadGirl(page);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    const r = await page.evaluate(() => {
      const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
      const o: any = {};
      o.laughAt = gg.untilForm('laugh', 3000);
      o.frozen = g.frozen();
      o.poseAt = gg.untilForm('pose', 3000);
      o.girlAt = gg.untilForm('girl', 3000);
      o.form = gg.form();
      return o;
    });
    expect(r.laughAt, '遠くでも 噴火が おわって 固まる').toBeGreaterThanOrEqual(0);
    expect(r.frozen).toBe(true);
    expect(r.poseAt).toBeGreaterThanOrEqual(0);
    expect(r.girlAt).toBeGreaterThanOrEqual(0);
    expect(errs).toEqual([]);
  });

  test('プレイヤーが やられて（体力 0）も、少女の 場面で 何も こわれない（エラーなし・形は そのまま すすむ）', async ({ page }) => {
    const errs = await ready(page);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    const reached = await page.evaluate(() => (window as any).__gg.untilForm('orbit', 4000));
    expect(reached).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => { const h = (window as any).__rikkun; h.combat.setHp(0); h.step(2); });
    const r = await page.evaluate(() => {
      const w = window as any, gt = w.__gt, gg = w.__gg, h = gt.h;
      const o: any = { dead: h.combat.get().hp };
      for (let i = 0; i < 900; i++) { h.step(1); if (h.combat.get().hp > 0 && i % 20 === 0) gt.heal(); }
      o.form = gg.form(); o.state = h.gasha.state(); o.frozen = gt.big().frozen(); o.hp = h.combat.get().hp;
      return o;
    });
    expect(['pose', 'girl', 'perch']).toContain(r.form);
    expect(r.state).toBe('present');
    expect(r.frozen).toBe(true);
    expect(errs).toEqual([]);
  });
});

test.describe('途中で 片づける（despawn）', () => {
  const STAGES = ['laugh', 'orbit', 'pose', 'girl', 'perch'] as const;
  for (const stage of STAGES) {
    test(`${stage} の とちゅうで 片づけても 何も のこらない。出しなおすと 最初から（もう 一度 少女まで すすめる）`, async ({ page }) => {
      const errs = await ready(page);
      await page.evaluate(() => (window as any).__gg.hpTo(0.3));
      const reached = await page.evaluate((s) => {
        const w = window as any, gt = w.__gt, gg = w.__gg;
        if (gg.untilForm(s, 8000) < 0) return false;
        if (s === 'perch') gt.until(() => w.__gashaGirl.phase() === 'perch', 900, () => gt.heal());
        else gt.run(40, () => gt.heal());
        return true;
      }, stage);
      expect(reached, stage + ' に ついた').toBe(true);
      await page.evaluate(() => (window as any).__rikkun.gasha.despawn());
      const r = await page.evaluate(() => {
        const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
        gt.taken.length = 0; w.__rikkun.combat.events();
        gt.run(12, () => gt.heal());
        const o: any = {
          state: w.__rikkun.gasha.state(), form: gg.form(), frozen: g.frozen(), girl: w.__gashaGirl.phase(), figure: w.__gashaGirl.figures[0].visible,
          bgm: gg.bgm(), bar: gg.barShown(), colliders: g.colliders().length, geysers: g.geysers().length, gi: gg.girl(),
        };
        gt.run(420, () => gt.heal());
        o.taken = gt.takenTotal();
        return o;
      });
      expect(r.state).toBe('idle');
      expect(r.form).toBe('big');
      expect(r.frozen).toBe(false);
      expect(r.girl, '少女は ねむる').toBe('dormant');
      expect(r.figure, '少女の 姿は 見えない').toBe(false);
      expect(r.bgm.cut, 'BGM の 切りっぱなしを やめる').toBe(false);
      expect(r.bgm.desired).toBeNull();
      expect(r.bgm.girlLock, '少女が 出た 記録も けす').toBe(false);
      expect(r.bar).toBe(false);
      expect(r.colliders).toBe(0);
      expect(r.gi.fireballs + r.gi.waves + r.gi.vortexCount).toBe(0);
      expect(r.taken).toBe(0);
      expect(bare(await leftovers(page))).toEqual(CLEAN);
      // 出しなおすと 新しい 体（体力 まんたん・固まって いない）。もう 一度 少女まで 行ける
      const again = await page.evaluate(async () => {
        const w = window as any, gt = w.__gt, gg = w.__gg, g = gt.big();
        const ok = await w.__rikkun.gasha.spawn({ distance: 60, angleDeg: -90 });
        g.walk(false); gt.put(64.5, 64.5); gt.heal();
        const o: any = { ok, form: gg.form(), frozen: g.frozen(), hp: g.hp(), max: g.maxHp(), girl: w.__gashaGirl.phase() };
        gg.hpTo(0.3);
        o.laughAt = gg.untilForm('laugh', 8000);
        o.bgmCut = gg.bgm().cut;
        return o;
      });
      expect(again.ok).toBe(true);
      expect(again.form).toBe('big');
      expect(again.frozen).toBe(false);
      expect(again.hp).toBe(again.max);
      expect(again.laughAt, 'もう一度 笑うまで すすむ').toBeGreaterThanOrEqual(0);
      expect(again.bgmCut).toBe(true);
      expect(errs).toEqual([]);
    });
  }
});
