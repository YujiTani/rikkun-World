import { test, expect } from '@playwright/test';
import { openGasha, setupBoss, leftovers, bare, CLEAN, quietCycle } from './helpers/gasha';
import { TUNE } from '../src/proto/gashaBigTuning';

/**
 * #293 がしゃどくろ: 5 つの 攻撃（slam2・sweep・beam・eruption・thunder）。
 * それぞれ「当たると ダメージ」「よけると 0」「終わったら 片づく（当たり・エフェクト・雲・電気の 数が 0）」を 確かめる。
 * 時間では 待たない。1 コマずつ 進めて、ゲームに 聞く（受けた ダメージは combat の playerHit）。
 * がしゃどくろは (64.5, 4.5) に 立ち +z（プレイヤーの 方）を 向く。プレイヤーの 基準は (64.5, 64.5)。
 */
test.describe.configure({ timeout: 300_000 });

const S2 = TUNE.slam2;
const SW = TUNE.sweep;
const BM = TUNE.beam;
const ER = TUNE.eruption;
const TH = TUNE.thunder;


test.describe('攻撃 slam2（両手たたきつけ）', () => {
  test('手の 落ちる 先の 半円に いると 打撃（大ダメージ）を 受ける', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await page.evaluate(() => {
      const gt = (window as any).__gt, g = gt.big();
      // 体から 34.5 ブロック 前（手の 落ちる 所の すこし 先）に 地面に 立ち 続ける
      gt.runAttack('slam2', () => gt.put(64.5, 39));
      return { hits: g.shock().hits.map((x: any) => ({ kind: x.kind, amount: x.amount, ok: x.ok })), taken: gt.taken.slice(), total: gt.takenTotal() };
    });
    const strike = r.hits.find((x: any) => x.kind === 'hit');
    expect(strike, '打撃(hit)が 記録される').toBeTruthy();
    expect(strike!.ok).toBe(true);
    expect(strike!.amount).toBe(S2.hitDamage);
    expect(r.total).toBeGreaterThanOrEqual(S2.hitDamage);
    expect(errs).toEqual([]);
  });

  test('衝撃波だけ（打撃の 半円の 外・地面に 立つ）なら 衝撃波の ダメージ', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await page.evaluate(() => {
      const gt = (window as any).__gt, g = gt.big();
      // 体の うしろ側。半円（体と 反対の 前がわ）の 外だが、輪（半径 48）の 中
      gt.runAttack('slam2', () => gt.put(64.5, -10.5));
      return { hits: g.shock().hits.map((x: any) => ({ kind: x.kind, amount: x.amount })), total: gt.takenTotal() };
    });
    expect(r.hits.map((x: any) => x.kind)).toEqual(['wave']);
    expect(r.hits[0]!.amount).toBe(S2.waveDamage);
    expect(r.total).toBe(S2.waveDamage);
    expect(errs).toEqual([]);
  });

  test('高く とんで いれば（打撃の 高さ・輪の 高さを こえる）ダメージ 0', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await page.evaluate((up) => {
      const gt = (window as any).__gt, g = gt.big();
      gt.runAttack('slam2', () => gt.put(64.5, 39, up));
      return { hits: g.shock().hits.length, total: gt.takenTotal() };
    }, S2.hitHeight + 3);
    expect(r.total).toBe(0);
    expect(r.hits).toBe(0);
    expect(errs).toEqual([]);
  });

  test('終わったら 当たり・輪・ひるみ・ゆれ・岩が ぜんぶ 片づく', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    await quietCycle(page);
    await page.evaluate(() => {
      const gt = (window as any).__gt;
      gt.runAttack('slam2', () => gt.put(64.5, 39, 8));
      gt.run(400); // 輪の 見た目が 消える まで（コマで 待つ）
    });
    const l = await leftovers(page);
    expect(bare(l)).toEqual(CLEAN);
    expect(l.mode).not.toBe('attack');
    expect(errs).toEqual([]);
  });
});

test.describe('攻撃 sweep（両手で 払う）', () => {
  /** 払っている 手の 場所に プレイヤーを 重ねる（up = 浮かせる 高さ）。払って いない 間は 基準の 場所 */
  const trackHand = (page: import('@playwright/test').Page, up: number) => page.evaluate((u) => {
    const gt = (window as any).__gt, g = gt.big();
    let swept = 0;
    gt.runAttack('sweep', () => {
      const side = g.attackInfo().sweepActive as string | null;
      if (!side) { gt.put(64.5, 64.5); return; }
      swept++;
      const hp = gt.jointPos(side + 'Hand');
      gt.put(hp.x, hp.z, u);
    });
    return { total: gt.takenTotal() as number, list: gt.taken.slice() as { tick: number; amount: number }[], swept };
  }, up);

  test('払う 腕の 通り道に 立っていると 当たる（ダメージ）', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await trackHand(page, 0);
    expect(r.swept).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThanOrEqual(SW.damage);
    expect(r.list.every((x) => x.amount === SW.damage)).toBe(true);
    expect(errs).toEqual([]);
  });

  test('腕の 高さを こえて（地面から 2 ブロック いじょう）いれば ダメージ 0', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await trackHand(page, SW.armHeight + 4);
    expect(r.swept).toBeGreaterThan(0);
    expect(r.total).toBe(0);
    expect(errs).toEqual([]);
  });

  test('終わったら 払いの 状態が のこらない', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    await quietCycle(page);
    await page.evaluate(() => {
      const gt = (window as any).__gt;
      gt.runAttack('sweep', () => gt.put(64.5, 64.5, 6));
      gt.run(120);
    });
    const l = await leftovers(page);
    expect(bare(l)).toEqual(CLEAN);
    expect(l.mode).not.toBe('attack');
    expect(await page.evaluate(() => (window as any).__gashaBig.attackInfo().sweepActive)).toBeNull();
    expect(errs).toEqual([]);
  });
});

test.describe('攻撃 beam（目から 光線）', () => {
  test('止まって いると 着弾点が 追いついて ダメージ', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await page.evaluate(() => {
      const gt = (window as any).__gt;
      gt.runAttack('beam', () => gt.put(64.5, 64.5));
      return { total: gt.takenTotal(), list: gt.taken.slice() };
    });
    expect(r.total).toBeGreaterThanOrEqual(BM.damage);
    expect(r.list.every((x: any) => x.amount === BM.damage)).toBe(true);
    expect(errs).toEqual([]);
  });

  test('走り 続ければ（ダッシュ速度）追いつかれず ダメージ 0', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await page.evaluate((speed) => {
      const gt = (window as any).__gt;
      const step = speed / 60; // 1 コマで 進む 距離（時間では なく コマ）
      gt.runAttack('beam', (i: number) => gt.put(64.5, 64.5 + i * step));
      return { total: gt.takenTotal() };
    }, BM.runSpeed);
    expect(r.total).toBe(0);
    expect(errs).toEqual([]);
  });

  test('ブロックの かげに かくれると 光線は 貫通せず ダメージ 0', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await page.evaluate(() => {
      const gt = (window as any).__gt, h = gt.h;
      // プレイヤーの すぐ 体がわに 高くて 厚い かべを 立てる（光線は 体の 目から 来る。貫通しない）
      const base = gt.groundTop(64, 61);
      h.world.fill(44, base - 2, 61, 84, base + 70, 62, 'stone');
      gt.runAttack('beam', () => gt.put(64.5, 64.5));
      return { total: gt.takenTotal() };
    });
    expect(r.total).toBe(0);
    expect(errs).toEqual([]);
  });

  test('終わったら 光線・こげ跡・炎・煙・ねらいが 片づく', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    await quietCycle(page);
    await page.evaluate(() => {
      const gt = (window as any).__gt;
      gt.runAttack('beam', (i: number) => gt.put(64.5, 64.5 + (i * 5.6) / 60));
      gt.run(1500); // こげ跡 30 秒・炎 7 秒が 消える まで（コマで 待つ）
    });
    const l = await leftovers(page);
    expect(bare(l)).toEqual(CLEAN);
    expect(l.mode).not.toBe('attack');
    expect(errs).toEqual([]);
  });
});

test.describe('攻撃 eruption（口から 火山噴火）', () => {
  /** 噴火を 1 回 出して、灰が 着地した コマと 場所を ぜんぶ 記録する（プレイヤーは 基準の 場所に 立ち 続ける） */
  async function probe(page: import('@playwright/test').Page) {
    return page.evaluate(() => {
      const gt = (window as any).__gt, g = gt.big(), h = gt.h;
      const seen = new Set<string>();
      const landings: { frame: number; x: number; y: number; z: number }[] = [];
      let rainFrame = -1;
      let frame = 0;
      g.attack('eruption');
      for (; frame < 4000; frame++) {
        gt.put(64.5, 64.5); gt.heal();
        h.step(1);
        const a = g.attackInfo();
        if (rainFrame < 0 && a.eruption.phase === 'rain') rainFrame = frame;
        for (const e of g.eruptionEmbers()) {
          const k = e.x.toFixed(3) + ',' + e.z.toFixed(3);
          if (!seen.has(k)) { seen.add(k); landings.push({ frame, x: e.x, y: e.y, z: e.z }); }
        }
        if (frame > 10 && a.mode !== 'attack') break;
      }
      return { landings, rainFrame, frames: frame };
    });
  }

  /**
   * 同じ 噴火を もう 1 回 再現する（まっさらな ブラウザ文脈 + 同じ 手順）。
   * とび立つ 間（rainFrame まで）は 基準の 場所に 立ち、そのあとは spot（なければ 基準の 場所）に 立つ。
   * spot に 立つのは 灰の 着地の 1 コマ前から。受けた ダメージの 記録を 返す。
   */
  async function replay(browser: import('@playwright/test').Browser, baseURL: string | undefined, rainFrame: number, spot: { frame: number; x: number; z: number } | null) {
    const ctx = await browser.newContext({ baseURL });
    try {
      const p2 = await ctx.newPage();
      const e2 = await openGasha(p2);
      await setupBoss(p2);
      const out = await p2.evaluate(({ rainFrame, spot }) => {
        const gt = (window as any).__gt, g = gt.big(), h = gt.h;
        const late: number[] = [];
        g.attack('eruption');
        for (let frame = 0; frame < 4000; frame++) {
          if (spot && frame >= spot.frame - 1 && frame >= rainFrame) gt.put(spot.x, spot.z); else gt.put(64.5, 64.5);
          gt.heal();
          const n0 = gt.taken.length;
          h.step(1);
          gt.drain();
          if (frame >= rainFrame) for (let i = n0; i < gt.taken.length; i++) late.push(gt.taken[i].amount);
          if (frame > 10 && g.attackInfo().mode !== 'attack') break;
        }
        return { late };
      }, { rainFrame, spot });
      return { ...out, errs: e2 };
    } finally {
      await ctx.close();
    }
  }

  test('灰が 足もとに 落ちると ダメージ。灰の 落ちない 所に いれば 0（同じ 噴火を 3 回 くらべる）', async ({ page, browser, baseURL }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const p = await probe(page);
    expect(p.landings.length).toBeGreaterThan(20);
    expect(p.rainFrame).toBeGreaterThan(0);
    // 全部 とび立った あと（rain）に 着地する 灰の うち、ほかの 灰から 4 ブロック 以上 はなれた もの = 当たる 場所
    const late = p.landings.filter((l) => l.frame > p.rainFrame + 2 && l.z > 0 && l.z < 140 && l.x > 0 && l.x < 135 && Math.hypot(l.x - 64.5, l.z - 64.5) > 6);
    expect(late.length).toBeGreaterThan(3);
    const target = late.find((l) => p.landings.every((o) => o === l || Math.hypot(o.x - l.x, o.z - l.z) > 4)) ?? late[0]!;

    // 同じ 噴火で、灰の 落ちる 点に 立つ → 当たる
    const hit = await replay(browser, baseURL, p.rainFrame, target);
    expect(hit.late, '灰の 落ちる 点に 立つと 当たる').toContain(ER.ash.damage);
    // 灰が ひとつも 落ちなかった 場所（基準の まわりで 灰から 十分 はなれた 所）に 立ち続ければ 0
    const near = (x: number, z: number) => p.landings.some((o) => Math.hypot(o.x - x, o.z - z) < ER.ash.hitRadius + 3);
    let safe: { x: number; z: number } | null = null;
    for (let z = 20; z <= 120 && !safe; z += 4) for (let x = 20; x <= 110 && !safe; x += 4) if (!near(x, z) && Math.hypot(x - 64.5, z - 4.5) > 8) safe = { x, z };
    expect(safe, '灰の 落ちない 場所').not.toBeNull();
    const dodge = await replay(browser, baseURL, p.rainFrame, { frame: 0, x: safe!.x, z: safe!.z });
    expect(dodge.late, '灰の 落ちない 所では 0').toEqual([]);
    for (const r of [hit, dodge]) expect(r.errs).toEqual([]);
    expect(errs).toEqual([]);
  });

  test('終わったら 灰・影・火柱・風・煙が 片づく（燃えかすは ほぼ 5 分 のこる）', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    await quietCycle(page);
    const r = await page.evaluate(() => {
      const gt = (window as any).__gt, g = gt.big();
      gt.runAttack('eruption', () => gt.put(64.5, 64.5, 30));
      gt.run(200);
      return { embers: g.attackInfo().eruption.embers };
    });
    const l = await leftovers(page);
    expect({ ...bare(l), eruptionEmbers: 0 }).toEqual(CLEAN);
    expect(l.eruptionEmbers).toBe(r.embers);
    expect(l.mode).not.toBe('attack');
    expect(r.embers).toBeGreaterThan(0);
    expect(errs).toEqual([]);
  });
});

test.describe('攻撃 thunder（自分に 落雷）', () => {
  test('止まって いると ねらい撃ちの 落雷に 当たる（ダメージ）', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const r = await page.evaluate(() => {
      const gt = (window as any).__gt, g = gt.big();
      gt.runAttack('thunder', () => gt.put(64.5, 64.5));
      return { total: gt.takenTotal(), list: gt.taken.slice(), hurts: g.attackInfo().thunder.strikeHurts };
    });
    expect(r.list.some((x: any) => x.amount === TH.around.damage)).toBe(true);
    expect(r.hurts).toBeGreaterThan(0);
    expect(errs).toEqual([]);
  });

  /** ねらい撃ちを 切った 落雷を 1 回 見て、落ちた 場所と コマを 記録する（プレイヤーは 基準の 場所） */
  async function probe(page: import('@playwright/test').Page) {
    return page.evaluate(() => {
      const gt = (window as any).__gt, g = gt.big(), h = gt.h;
      g.tune({ thunder: { around: { aimShare: 0 } } });
      const spots: { frame: number; x: number; z: number }[] = [];
      g.attack('thunder');
      let frame = 0;
      for (; frame < 3000; frame++) {
        gt.put(64.5, 64.5); gt.heal();
        const n0 = g.thunderSpots().length;
        h.step(1);
        const all = g.thunderSpots();
        for (let i = n0; i < all.length; i++) spots.push({ frame, x: all[i].x, z: all[i].z });
        if (frame > 10 && g.attackInfo().mode !== 'attack') break;
      }
      return { spots };
    });
  }

  async function replay(browser: import('@playwright/test').Browser, baseURL: string | undefined, at: { frame: number; x: number; z: number } | { x: number; z: number }) {
    const ctx = await browser.newContext({ baseURL });
    try {
      const p2 = await ctx.newPage();
      const e2 = await openGasha(p2);
      await setupBoss(p2);
      const out = await p2.evaluate((at) => {
        const gt = (window as any).__gt, g = gt.big(), h = gt.h;
        g.tune({ thunder: { around: { aimShare: 0 } } });
        g.attack('thunder');
        for (let frame = 0; frame < 3000; frame++) {
          if ('frame' in at && frame < at.frame - 1) gt.put(64.5, 64.5); else gt.put(at.x, at.z);
          gt.heal();
          h.step(1);
          gt.drain();
          if (frame > 10 && g.attackInfo().mode !== 'attack') break;
        }
        return { list: gt.taken.slice() as { tick: number; amount: number }[], hurts: g.attackInfo().thunder.strikeHurts as number };
      }, at);
      return { ...out, errs: e2 };
    } finally {
      await ctx.close();
    }
  }

  test('雷の 落ちる 点に 立つと 当たる。どこにも 落ちない 所に いれば 0（同じ 落雷を くらべる）', async ({ page, browser, baseURL }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    const p = await probe(page);
    expect(p.spots.length).toBeGreaterThan(5);
    // 体の 近く（落雷と 電気が かさなる）から はなれた 落雷の 点
    const far = p.spots.filter((s) => Math.hypot(s.x - 64.5, s.z - 4.5) > 25 && s.z < 150 && s.x > 0 && s.x < 135);
    expect(far.length).toBeGreaterThan(0);
    const target = far[0]!;
    const hit = await replay(browser, baseURL, target);
    expect(hit.list.some((x) => x.amount === TH.around.damage), '落ちる 点に 立つと 当たる').toBe(true);
    // どの 落雷からも 十分 はなれた 場所
    const clear = (x: number, z: number) => p.spots.every((s) => Math.hypot(s.x - x, s.z - z) > TH.around.radius + 3) && Math.hypot(x - 64.5, z - 4.5) > 30;
    let safe: { x: number; z: number } | null = null;
    for (let z = 40; z <= 140 && !safe; z += 4) for (let x = 10; x <= 120 && !safe; x += 4) if (clear(x, z)) safe = { x, z };
    expect(safe, '落雷の 落ちない 場所').not.toBeNull();
    const dodge = await replay(browser, baseURL, safe!);
    expect(dodge.list).toEqual([]);
    expect(dodge.hurts).toBe(0);
    for (const r of [hit, dodge]) expect(r.errs).toEqual([]);
    expect(errs).toEqual([]);
  });

  test('終わったら 雷雲・電気・落雷・光が 片づく', async ({ page }) => {
    const errs = await openGasha(page);
    await setupBoss(page);
    await quietCycle(page);
    await page.evaluate(() => {
      const gt = (window as any).__gt;
      gt.runAttack('thunder', () => gt.put(64.5, 64.5, 40));
      gt.run(120);
    });
    const l = await leftovers(page);
    expect(bare(l)).toEqual(CLEAN);
    expect(l.mode).not.toBe('attack');
    expect(errs).toEqual([]);
  });
});
