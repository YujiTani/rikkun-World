import { test, expect, type Page } from '@playwright/test';
import { openGasha, setupBoss, quietCycle } from './helpers/gasha';
import { installAimHelpers } from './helpers/aim';
import { takeKatana, runTech, settle } from './helpers/blade';
import { TUNE } from '../src/proto/gashaBigTuning';

/**
 * #293 噴火の 燃えかす: 約 5 分で 消える・殴ると 消える・触れると ドットダメージ・灰が 落ちた 点の 植物が 燃える。
 * 時間では 待たず、コマで 進める（5 分 = 18000 コマ）。
 */
test.describe.configure({ timeout: 300_000 });

const EM = TUNE.eruption.ember;
const ER = TUNE.eruption;

interface Ember { id: number; x: number; y: number; z: number; age: number; body: boolean }

/** 噴火を 1 回 おわらせて（灰が ぜんぶ 落ちる まで）、次の 攻撃が 来ない ように する */
async function erupt(page: Page, stand?: { x: number; z: number; up?: number }): Promise<Ember[]> {
  await quietCycle(page);
  return page.evaluate((stand) => {
    const gt = (window as any).__gt, g = gt.big();
    gt.runAttack('eruption', () => { if (stand) gt.put(stand.x, stand.z, stand.up ?? 0); else gt.put(64.5, 64.5, 30); });
    gt.run(240, () => { if (stand) gt.put(stand.x, stand.z, stand.up ?? 0); else gt.put(64.5, 64.5, 30); gt.heal(); });
    return g.eruptionEmbers() as Ember[];
  }, stand ?? null);
}

/** 近くに 別の 燃えかすが ない（minGap ブロック いない）、読みこんだ 範囲の 地面の 燃えかす */
const isolated = (list: Ember[], minGap = 5) => list.filter((e) => !e.body && e.z > 8 && e.z < 120 && e.x > 8 && e.x < 120 && list.every((o) => o === e || Math.hypot(o.x - e.x, o.z - e.z) > minGap));

/** 切る・殴る 場所（手前）と 同じ 高さの 地面の 燃えかす（隕石の 小さな 穴の 底の ものは 除く）の 印 */
const flatOf = (page: Page, list: Ember[]) => page.evaluate((l) => l.map((e: Ember) => { const gt = (window as any).__gt; return gt.groundTop(e.x, e.z) === e.y && gt.groundTop(e.x, e.z + 1.8) === e.y; }), list);
/** e の いちばん 近い ほかの 燃えかす（地面の もの。体の 上は 除く） */
const nearestOther = (list: Ember[], e: Ember): Ember => list.filter((o) => o !== e && !o.body).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0]!;

test.describe('燃えかす', () => {
  test('約 5 分（調整表の sec）のこって、そのあと 消える。5 分 たつ 前に 消えない', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const list = await erupt(page);
    expect(list.length).toBeGreaterThan(20);
    // 燃えかす 1 つ 1 つが「落ちてから sec 秒」で 消える（落ちた 時刻は ばらばら）。消える 瞬間の 年れいを コマごとに 見る
    const r = await page.evaluate((sec) => {
      const gt = (window as any).__gt, g = gt.big();
      const age = new Map<number, number>();
      for (const e of g.eruptionEmbers() as { id: number; age: number }[]) age.set(e.id, e.age);
      const n0 = age.size;
      const oldest = Math.max(...age.values());
      const early: number[] = []; // sec より 早く 消えた 年れい
      let frames = 0;
      const total = Math.ceil((sec - oldest) * 60) + 1200; // いちばん 古い ものが 消えて から 十分 あと まで
      for (; frames < total; frames++) {
        gt.put(64.5, 64.5, 30); gt.heal();
        (window as any).__rikkun.step(1);
        const now = new Map<number, number>();
        for (const e of g.eruptionEmbers() as { id: number; age: number }[]) now.set(e.id, e.age);
        for (const [id, a] of age) if (!now.has(id) && a + 1 / 60 < sec - 0.05) early.push(a);
        age.clear(); for (const [id, a] of now) age.set(id, a);
      }
      return { n0, left: g.attackInfo().eruption.embers as number, early, oldest };
    }, EM.sec);
    expect(r.n0).toBeGreaterThan(20);
    expect(r.early, 'sec 秒 たつ 前に 消えた 燃えかす（年れい）').toEqual([]);
    expect(r.left, 'sec 秒 たつと ぜんぶ 消える').toBe(0);
    expect(errs).toEqual([]);
  });

  test('触れて いると ドットダメージ（燃えかすの 上に 立つ）。足が 高く はなれて いれば 受けない', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const list = await erupt(page);
    const e = isolated(list)[0]!;
    expect(e).toBeTruthy();
    const r = await page.evaluate(({ e }) => {
      const gt = (window as any).__gt, h = gt.h;
      const hits = () => (h.combat.events() as { type: string; amount: number }[]).filter((x) => x.type === 'playerHit').map((x) => x.amount);
      // 燃えかすの 真上 6 ブロックに 2 秒（120 コマ）浮く（足の 高さが ちがう ので 触れない）
      gt.heal(); hits();
      const away: number[] = [];
      for (let i = 0; i < 120; i++) { gt.put(e.x, e.z, 6); h.step(1); away.push(...hits()); }
      // 燃えかすの 上に 2 秒（体力は もどさない。ダメージを 受けた あとの むてき時間を こわさない ため）
      gt.heal(); hits();
      const on: number[] = [];
      for (let i = 0; i < 120; i++) { gt.put(e.x, e.z); h.step(1); on.push(...hits()); }
      return { away, on };
    }, { e });
    expect(r.away).toEqual([]);
    expect(r.on.length).toBeGreaterThanOrEqual(1);
    expect(r.on.every((x) => x === EM.dotDamage)).toBe(true);
    expect(errs).toEqual([]);
  });

  test('刀で 殴ると その 燃えかすだけ 消える（ほかは のこる）', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const list = await erupt(page);
    // 隕石の まわりに 火の 粉の 燃えかすが かたまる ので、すきまは 3.5 ブロック。隕石の 小さな 穴の 底では なく、切る 場所（手前）と 同じ 高さの 地面の もの
    const flat = await flatOf(page, list);
    const targets = isolated(list, 3.5).filter((e) => flat[list.indexOf(e)]);
    expect(targets.length).toBeGreaterThan(1);
    const e = targets[0]!, other = targets[targets.length - 1]!, neighbor = nearestOther(list, e);
    expect(neighbor, '近い 隣').toBeTruthy();
    await takeKatana(page, 'chudan');
    await page.evaluate((e) => {
      const gt = (window as any).__gt, h = gt.h;
      gt.put(e.x, e.z + 1.8); // 燃えかすの 手前（+z）から -z の 向きに 切る
      h.player.set({ yaw: 0, pitch: 0 });
      h.step(1);
    }, e);
    const before = await page.evaluate(() => (window as any).__gashaBig.attackInfo().eruption.embers as number);
    await runTech(page, 14);
    await settle(page, 20);
    const after = await page.evaluate((ids) => {
      const g = (window as any).__gashaBig;
      const live = new Set(g.eruptionEmbers().map((x: Ember) => x.id));
      return { n: g.attackInfo().eruption.embers as number, doused: g.attackInfo().eruption.doused as number, eGone: !live.has(ids.e), otherKept: live.has(ids.o), neighborKept: live.has(ids.n) };
    }, { e: e.id, o: other.id, n: neighbor.id });
    expect(after.eGone, '殴った 燃えかすは 消える').toBe(true);
    expect(after.otherKept, 'はなれた 燃えかすは のこる').toBe(true);
    expect(after.neighborKept, '近い 隣の 燃えかすも のこる').toBe(true);
    expect(after.doused).toBeGreaterThanOrEqual(1);
    expect(after.n).toBeLessThan(before);
    expect(errs).toEqual([]);
  });

  test('素手の パンチでも 燃えかすが 消える（殴ると 消える）', async ({ page }) => {
    const errs = await openGasha(page);
    await installAimHelpers(page);
    await setupBoss(page);
    const list = await erupt(page);
    const flat = await flatOf(page, list);
    const e = isolated(list, 3.5).filter((q) => flat[list.indexOf(q)])[0]!; // 刀と おなじ: 穴の 底では なく 同じ 高さの 地面の もの
    expect(e).toBeTruthy();
    const neighbor = nearestOther(list, e);
    const r = await page.evaluate(({ e, nid }) => {
      const gt = (window as any).__gt, h = gt.h, aim = (window as any).__aim, g = gt.big();
      // 何も 持たない（素手）
      for (let i = 0; i < 9; i++) h.inventory.setSlot(i, null);
      h.inventory.select(0);
      gt.put(e.x, e.z + 2.2);
      aim.solve(Math.floor(e.x), e.y - 1, Math.floor(e.z), 1.0);
      h.step(1);
      const p = h.player.get();
      const n0 = g.attackInfo().eruption.embers as number;
      h.input.press('primary');
      for (let i = 0; i < 60; i++) { gt.heal(); h.player.set({ yaw: p.yaw, pitch: p.pitch }); h.step(1); }
      h.input.release('primary');
      h.step(10);
      const live = new Set(g.eruptionEmbers().map((x: Ember) => x.id));
      return { n0, n1: g.attackInfo().eruption.embers as number, gone: !live.has(e.id), neighborKept: live.has(nid), doused: g.attackInfo().eruption.doused as number };
    }, { e, nid: neighbor.id });
    expect(r.gone, '殴った 燃えかすは 消える').toBe(true);
    expect(r.neighborKept, '近い 隣の 燃えかすは のこる').toBe(true);
    expect(r.doused).toBeGreaterThanOrEqual(1);
    expect(errs).toEqual([]);
  });

  test('灰が 落ちた 点の まわり（burnRadius）の 植物が 燃えて、はなれた 植物は のこる', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    // 地面いちめんに くさ を 置く
    const cells = await page.evaluate(() => {
      const gt = (window as any).__gt, h = gt.h;
      const out: { x: number; y: number; z: number }[] = [];
      for (let x = 20; x <= 110; x++) for (let z = 12; z <= 118; z++) {
        const y = gt.groundTop(x, z);
        if (h.world.getBlock(x, y, z) === 'air' && h.world.setBlock(x, y, z, 'kusa')) out.push({ x, y, z });
      }
      return out;
    });
    expect(cells.length).toBeGreaterThan(5000);
    const list = await erupt(page);
    const grass = await page.evaluate((cells) => {
      const h = (window as any).__gt.h;
      return cells.map((c: { x: number; y: number; z: number }) => h.world.getBlock(c.x, c.y, c.z) === 'kusa');
    }, cells);
    const R = ER.burnRadius;
    const landings = list.filter((e) => !e.body);
    let near = 0, nearBurnt = 0, far = 0, farBurnt = 0;
    cells.forEach((c, i) => {
      let dmin = Infinity;
      for (const e of landings) dmin = Math.min(dmin, Math.hypot(c.x + 0.5 - e.x, c.y + 0.5 - e.y, c.z + 0.5 - e.z));
      if (dmin <= R - 0.3) { near++; if (!grass[i]) nearBurnt++; }
      else if (dmin > R + 1.5) { far++; if (!grass[i]) farBurnt++; }
    });
    expect(landings.length).toBeGreaterThan(20);
    expect(near).toBeGreaterThan(20);
    expect(nearBurnt, '落ちた 点の すぐ そばの くさは 燃える').toBe(near);
    expect(farBurnt, 'はなれた くさは のこる').toBe(0);
    expect(far).toBeGreaterThan(1000);
    expect(errs).toEqual([]);
  });

  test('家・置いた ブロックは 噴火で こわれない: 屋根・床（かわら）・柱（き）・チェスト（たんす）は 全部 のこり、穴も あかない。地面の 草は 燃える', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    // 地面いちめんに 家の 部品を 置く: かわら（屋根・床 = 地面の いちばん 上を おきかえ）・き（柱）・たんす（チェスト）。ほかに 草も
    const cells = await page.evaluate(() => {
      const gt = (window as any).__gt, h = gt.h;
      const out: { x: number; y: number; z: number; b: string }[] = [];
      for (let x = 20; x <= 110; x++) for (let z = 12; z <= 118; z++) {
        const y = gt.groundTop(x, z), m = (x + z) % 4;
        if (h.world.getBlock(x, y, z) !== 'air') continue;
        if (m === 0) { if (h.world.setBlock(x, y - 1, z, 'kawara')) out.push({ x, y: y - 1, z, b: 'kawara' }); }
        else if (m === 1) { if (h.world.setBlock(x, y, z, 'log')) out.push({ x, y, z, b: 'log' }); }
        else if (m === 2) { if (h.world.setBlock(x, y, z, 'tansu')) out.push({ x, y, z, b: 'tansu' }); }
        else h.world.setBlock(x, y, z, 'kusa');
      }
      return out;
    });
    expect(cells.length).toBeGreaterThan(4000);
    const list = await erupt(page);
    expect(list.filter((e) => !e.body).length).toBeGreaterThan(20);
    const changed = await page.evaluate((cells) => {
      const h = (window as any).__gt.h;
      return cells.filter((c: { x: number; y: number; z: number; b: string }) => h.world.getBlock(c.x, c.y, c.z) !== c.b).map((c: { x: number; y: number; z: number; b: string }) => `${c.b}@${c.x},${c.y},${c.z}`);
    }, cells);
    expect(changed, '家の 部品は ひとつも かわらない').toEqual([]);
    expect(errs).toEqual([]);
  });

  test('プレイヤーが 遠く（80 ブロック いじょう）へ いって もどっても、燃えかすは のこって いる（約 5 分 のこる 決まり）', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const list = await erupt(page);
    const n0 = list.length;
    expect(n0).toBeGreaterThan(20);
    const r = await page.evaluate((far) => {
      const gt = (window as any).__gt, g = gt.big();
      gt.run(600, () => { gt.put(far.x, far.z); gt.heal(); }); // 体から 100 ブロック以上 はなれて 10 秒
      const dist = Math.hypot(far.x - gt.boss().x, far.z - gt.boss().z);
      gt.run(60, () => { gt.put(64.5, 64.5, 30); gt.heal(); }); // もどる
      return { dist, left: g.attackInfo().eruption.embers as number };
    }, { x: 64.5, z: 170.5 });
    expect(r.dist).toBeGreaterThan(80);
    expect(r.left, '遠くへ いって もどっても 燃えかすは のこる').toBe(n0);
    expect(errs).toEqual([]);
  });

  test('攻撃の 途中で 休んでも（tired）、燃えかすは 消えない（約 5 分 のこる 決まり）', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const list = await erupt(page);
    const n0 = list.length;
    expect(n0).toBeGreaterThan(20);
    const r = await page.evaluate(() => {
      const gt = (window as any).__gt, g = gt.big();
      g.attack('slam2');
      gt.run(60, () => { gt.put(64.5, 64.5, 30); gt.heal(); });
      const mode = g.attackInfo().mode as string;
      g.tired(600);
      gt.run(30, () => { gt.put(64.5, 64.5, 30); gt.heal(); });
      return { mode, left: g.attackInfo().eruption.embers as number };
    });
    expect(r.mode, '攻撃の 途中だった').toBe('attack');
    expect(r.left, '休んでも 燃えかすは のこる').toBe(n0);
    expect(errs).toEqual([]);
  });
});
