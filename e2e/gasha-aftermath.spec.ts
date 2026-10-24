import { test, expect, type Page } from '@playwright/test';
import { openGasha, setupBoss, installGirlTools, loadGirl } from './helpers/gasha';
import { takeKatana, runTech, settle } from './helpers/blade';
import { TUNE as BT } from '../src/proto/gashaBigTuning';

/**
 * #293 直し 4（オーナーが 遊んで 見つけた バグ）の E2E。時間では 待たず、コマで 進める。
 *  1. たおした 後の 大きな 姿は 動かない（さまよい・追いかけ・攻撃が もどらない）
 *  2. 間欠泉で 体や ガラスの 下に 押し上げられても はさまらない
 *  3. 少女が 肩で 休んで いる 間も BGM は「災厄」のまま
 */
test.describe.configure({ timeout: 360_000 });

const FAST = { eye: { turnsPerShow: 1, bigWaitSec: 600 }, timing: { goneSec: 0.2 } };

/** コアを たたく 回数・間かくを 小さくする（とどめの 前に 呼ぶ） */
async function quickCore(page: Page, hits: number, gap = 0.1): Promise<void> {
  await page.evaluate(({ hits, gap }) => { const c = (window as any).__rikkun.gasha.bigTune.finish.core; c.hits = hits; c.hitGapSec = gap; }, { hits, gap });
}

/** 倒れて コアが たたける（lie）まで */
async function untilLie(page: Page): Promise<number> {
  return page.evaluate(() => { const w = window as any, gt = w.__gt; return gt.until(() => w.__gashaBig.finishInfo().phase === 'lie', 2000, () => gt.heal()) as number; });
}

/**
 * 刀で とどめを さす（本物の ゲームと おなじ 道: 当たりは ゲームの 1 コマの 中で 起きる）。体力を 1 に して、頭の よこに 立って 突く。
 * ※ gasha.defeat() / damage() は コマの 外で 体力を 0 に する ので、本物と 順番が ちがう。
 */
async function swordKill(page: Page): Promise<void> {
  await takeKatana(page, 'chudan');
  await page.evaluate(() => (window as any).__gg.hpTo(0.001));
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => {
      const w = window as any, gt = w.__gt, g = gt.big(), h = gt.h;
      const c = g.colliders().find((q: any) => q.name === 'skull');
      const boss = gt.boss();
      let dx = c.center[0] - boss.x, dz = c.center[2] - boss.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const px = c.center[0] + dx * (Math.max(c.half[0], c.half[2]) + 1.5), pz = c.center[2] + dz * (Math.max(c.half[0], c.half[2]) + 1.5);
      h.player.set({ position: { x: px, y: c.center[1], z: pz }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: (Math.atan2(-dx, dz) * 180) / Math.PI, pitchDeg: 0 });
      h.step(1);
    });
    await runTech(page, 14);
    if ((await page.evaluate(() => (window as any).__gashaBig.hp() as number)) <= 0) break;
    await settle(page, 30);
    await page.evaluate(() => { const gt = (window as any).__gt; gt.heal(); });
  }
  expect(await page.evaluate(() => (window as any).__gashaBig.hp() as number), '刀で 体力 0').toBe(0);
  await settle(page, 5);
}

interface Pose { x: number; y: number; z: number; yawDeg: number; mode: string; attack: string | null; walkLeft: number }

const pose = (page: Page): Promise<Pose> =>
  page.evaluate(() => { const g = (window as any).__gashaBig, i = g.info(), a = g.attackInfo(); return { x: i.pos[0], y: i.pos[1], z: i.pos[2], yawDeg: i.yawDeg, mode: a.mode, attack: a.attack, walkLeft: g.motion().walkLeft } as any; });

/** n コア 進めながら 毎 300 コマ 体の 位置・向きが かわって いないか 見る。かわった 最大の ずれを 返す */
async function watchStill(page: Page, frames: number, each?: () => void): Promise<{ drift: number; modes: string[]; attacks: number }> {
  const start = await pose(page);
  let drift = 0, attacks = 0;
  const modes = new Set<string>();
  for (let done = 0; done < frames; done += 300) {
    await page.evaluate(() => { const gt = (window as any).__gt; gt.run(300, () => gt.heal()); });
    if (each) await page.evaluate(each);
    const p = await pose(page);
    modes.add(p.mode);
    if (p.attack) attacks++;
    drift = Math.max(drift, Math.hypot(p.x - start.x, p.y - start.y, p.z - start.z), Math.abs(p.yawDeg - start.yawDeg));
  }
  return { drift, modes: [...modes], attacks };
}

const FIVE_MIN = 60 * 60 * 5;

test.describe('1. たおした 後は 動かない', () => {
  test('とどめ → 倒れて 沈む … コアを こわさない まま 5 分 たっても 位置・向きが かわらず、さまよわない・追わない・攻撃しない', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await swordKill(page);
    expect(await untilLie(page), '倒れきる').toBeGreaterThanOrEqual(0);
    const r = await watchStill(page, FIVE_MIN);
    expect(r.modes, '固まった まま').toEqual(['frozen']);
    expect(r.attacks).toBe(0);
    expect(r.drift, '位置・向きが かわらない').toBeLessThan(1e-6);
    expect(await page.evaluate(() => (window as any).__rikkun.gasha.info().state)).toBe('present');
    expect(errs).toEqual([]);
  });

  test('プレイヤーが 追われる 近さ（20 ブロック）でも、とどめの 直後から 5 分 追って こない', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await swordKill(page);
    expect(await untilLie(page)).toBeGreaterThanOrEqual(0);
    // プレイヤーを 体から 20 ブロックまで 近づける
    await page.evaluate(() => { const gt = (window as any).__gt, b = gt.boss(); gt.put(b.x, b.z + 22); gt.heal(); });
    const r = await watchStill(page, FIVE_MIN);
    expect(r.modes).toEqual(['frozen']);
    expect(r.attacks).toBe(0);
    expect(r.drift).toBeLessThan(1e-6);
    expect(errs).toEqual([]);
  });

  test('少女の 形態（肩で 休む 間）に コアを なぐって たおしても、とどめが 正しく 走り 5 分 動かない', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await loadGirl(page);
    await page.evaluate((t) => (window as any).__gashaGirl.tune(t), FAST);
    await quickCore(page, 2);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    const seated = await page.evaluate(() => {
      const w = window as any, gt = w.__gt;
      if (w.__gg.untilForm('perch') < 0) return false;
      return gt.until(() => w.__gashaGirl.phase() === 'perch', 900, () => gt.heal()) >= 0;
    });
    expect(seated, '肩に 座る').toBe(true);
    // 肩の 少女を 刀で なぐって 体力 0（本物の 道: 当たりは ゲームの 1 コマの 中）
    await takeKatana(page, 'chudan');
    await page.evaluate(() => {
      const w = window as any, gt = w.__gt, h = gt.h, g = gt.big();
      w.__gg.hpTo(0.001);
      gt.run(5, () => undefined);
      const sp = g.perchSpot(), gi = w.__gashaGirl.info();
      h.player.set({ position: { x: gi.girlX, y: sp.y - 0.2, z: gi.girlZ + 1.8 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
      h.step(1);
    });
    await runTech(page, 14);
    await settle(page, 3);
    expect(await page.evaluate(() => (window as any).__rikkun.gasha.info().form), 'とどめの 流れ').toBe('down');
    expect(await untilLie(page), '倒れきる').toBeGreaterThanOrEqual(0);
    const r = await watchStill(page, FIVE_MIN);
    expect(r.modes).toEqual(['frozen']);
    expect(r.attacks).toBe(0);
    expect(r.drift).toBeLessThan(1e-6);
    // コアは まだ たたける（倒れた 流れが こわれて いない）
    const core = await page.evaluate(() => (window as any).__gashaBig.finishInfo() as { phase: string; coreHp: number });
    expect(core.phase).toBe('lie');
    expect(core.coreHp).toBe(2);
    expect(errs).toEqual([]);
  });

  test('コアを たたいて ドロップを ひろっても 動かない。たたいた あとも 5 分 そのまま', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await quickCore(page, 3);
    await swordKill(page);
    expect(await untilLie(page)).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => { const w = window as any; w.__gashaBig.damage('core', 1); w.__rikkun.step(30); });
    const bags = await page.evaluate(() => ((window as any).__rikkun.combat.bags() as { id: number; x?: number; y?: number; z?: number; position?: { x: number; y: number; z: number } }[]).length);
    expect(bags, 'ドロップが ばらまかれた').toBeGreaterThan(0);
    // 落ちた 場所へ 歩いて ひろう（袋の 場所へ プレイヤーを 立たせる）
    await page.evaluate(() => {
      const w = window as any, gt = w.__gt, h = gt.h;
      for (const b of h.combat.bags() as any[]) {
        const p = b.position ?? { x: b.x, y: b.y, z: b.z };
        h.player.set({ position: { x: p.x, y: p.y + 0.1, z: p.z }, velocity: { x: 0, y: 0, z: 0 } });
        gt.run(30, () => gt.heal());
      }
    });
    const r = await watchStill(page, FIVE_MIN);
    expect(r.modes).toEqual(['frozen']);
    expect(r.drift).toBeLessThan(1e-6);
    expect(errs).toEqual([]);
  });

  test('遠く（farDist より 先）に いても、遠くへ 行って もどっても 動かない', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await page.evaluate(async () => {
      const gt = (window as any).__gt;
      const ok = await gt.spawn({ distance: 100, angleDeg: 0 });
      if (!ok) throw new Error('出せなかった');
      gt.put(64.5, 64.5); gt.heal();
    });
    await page.evaluate(() => { const w = window as any; w.__gg.hpTo(0.001); w.__gashaBig.damage('head', 1e6); w.__rikkun.step(3); });
    expect(await untilLie(page), '遠くでも 倒れる').toBeGreaterThanOrEqual(0);
    const far = await watchStill(page, 60 * 120);
    expect(far.modes).toEqual(['frozen']);
    expect(far.drift).toBeLessThan(1e-6);
    // 近づく → 反対がわの 遠くへ → もどる
    await page.evaluate(() => { const gt = (window as any).__gt, b = gt.boss(); gt.put(b.x - 30, b.z); gt.heal(); });
    const near = await watchStill(page, 60 * 60);
    expect(near.drift).toBeLessThan(1e-6);
    await page.evaluate(() => { const gt = (window as any).__gt, b = gt.boss(); gt.put(b.x + 150, b.z, 30); gt.heal(); });
    const away = await watchStill(page, 60 * 60, () => { const gt = (window as any).__gt; gt.put(gt.boss().x + 150, gt.boss().z, 30); });
    expect(away.drift).toBeLessThan(1e-6);
    await page.evaluate(() => { const gt = (window as any).__gt, b = gt.boss(); gt.put(b.x - 40, b.z); gt.heal(); });
    const back = await watchStill(page, 60 * 60);
    expect(back.modes).toEqual(['frozen']);
    expect(back.drift).toBeLessThan(1e-6);
    expect(errs).toEqual([]);
  });
});



// ---------------------------------------------------------------- 2. 間欠泉で はさまる

/** 低い 雲(bank*)の すぐ そとに 順番に 立って 刀で 突く。どれかで ガラスが 割れれば true */
async function swingAtSomeGlass(page: Page): Promise<boolean> {
  const names: string[] = await page.evaluate(() => (window as any).__gashaBig.colliders().filter((c: any) => c.mask && c.name.startsWith('bank')).map((c: any) => c.name as string));
  for (const name of names.slice(0, 40)) {
    const b0 = await page.evaluate((name) => {
      const w = window as any, gt = w.__gt, g = gt.big(), h = gt.h;
      const c = g.colliders().find((q: any) => q.name === name);
      const boss = gt.boss();
      let dx = c.center[0] - boss.x, dz = c.center[2] - boss.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const px = c.center[0] + dx * (Math.max(c.half[0], c.half[2]) + 1.2), pz = c.center[2] + dz * (Math.max(c.half[0], c.half[2]) + 1.2);
      h.player.set({ position: { x: px, y: c.center[1] - 0.8, z: pz }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: (Math.atan2(-dx, dz) * 180) / Math.PI, pitchDeg: 0 });
      gt.heal();
      h.step(1);
      return g.glassInfo().broken as number;
    }, name);
    await runTech(page, 14);
    const b1 = await page.evaluate(() => (window as any).__gashaBig.glassInfo().broken as number);
    await settle(page, 20);
    if (b1 > b0) return true;
  }
  return false;
}

/** 体の 下（肩の 雲の 近く。上に 体・ガラスが ある 場所）に 間欠泉を 立てて、その 中に プレイヤーを 立たせる */
async function standInGeyserUnderBody(page: Page): Promise<{ x0: number; z0: number; ground: number; top: number }> {
  const ge = await page.evaluate(() => {
    const w = window as any, gt = w.__gt, g = gt.big();
    g.spawnGeyser(58, 5, 0);
    gt.run(320, () => gt.heal());
    const q = g.geysers().find((s: any) => s.x0 >= 56 && s.x0 <= 60 && s.state !== 'cracking');
    return q ? { x0: q.x0 as number, z0: q.z0 as number, ground: q.ground as number, top: q.top as number } : null;
  });
  expect(ge, '体の 下に 間欠泉が 立つ').not.toBeNull();
  await page.evaluate((q) => {
    const w = window as any, gt = w.__gt, h = gt.h;
    h.player.set({ position: { x: q.x0 + 1, y: q.ground + 0.2, z: q.z0 + 1 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
  }, ge!);
  return ge!;
}

/** n コマ 進めて、はさまって いないか（ずっと 上へ 押されて いるのに 高さが かわらない）を 返す */
const pinnedFor = (page: Page, frames: number): Promise<{ pinned: boolean; y: number; vy: number }> =>
  page.evaluate((frames) => {
    const w = window as any, gt = w.__gt, h = gt.h;
    gt.run(frames - 40, () => gt.heal());
    const y0 = h.player.get().position.y;
    let lift = 0;
    for (let i = 0; i < 40; i++) { gt.heal(); h.step(1); if (h.player.get().velocity.y > 0.5) lift++; }
    const p = h.player.get();
    return { pinned: Math.abs(p.position.y - y0) < 0.02 && lift >= 30, y: p.position.y as number, vy: p.velocity.y as number };
  }, frames);

test.describe('2. 間欠泉で 体・ガラスの 下に 押し上げられても はさまらない', () => {
  test('少女の 間、体の 下の 間欠泉に 入っても 天井に 押しつけられた まま 動けなく ならない（上昇を 止める）', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await loadGirl(page);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    expect(await page.evaluate(() => (window as any).__gg.untilForm('laugh'))).toBeGreaterThanOrEqual(0);
    await standInGeyserUnderBody(page);
    const r = await pinnedFor(page, 200);
    expect(r.pinned, `押しつけられた まま（y = ${r.y}, vy = ${r.vy}）`).toBe(false);
    expect(errs).toEqual([]);
  });

  test('はさまった 場所から でられる: 数コマ あとに 横へ 歩いて 柱の 外へ 出られる', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await loadGirl(page);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    expect(await page.evaluate(() => (window as any).__gg.untilForm('laugh'))).toBeGreaterThanOrEqual(0);
    const ge = await standInGeyserUnderBody(page);
    // 柱の 中心に 立って、四方の どれかへ 歩けば 柱の 外へ 出られる(体の かべが ある 方は 出られなくても よい)
    const out = await page.evaluate((q) => {
      const w = window as any, gt = w.__gt, h = gt.h;
      gt.run(60, () => gt.heal());
      let outAt = -1, dir = -1, x = 0;
      for (const yawDeg of [270, 90, 0, 180]) {
        h.player.set({ position: { x: q.x0 + 1, y: q.ground + 0.2, z: q.z0 + 1 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg, pitchDeg: 0 });
        gt.run(10, () => gt.heal());
        h.input.press('moveForward');
        for (let i = 0; i < 120; i++) {
          gt.heal(); h.step(1);
          const p = h.player.get().position;
          if (p.x < q.x0 - 0.5 || p.x > q.x0 + 2.5 || p.z < q.z0 - 0.5 || p.z > q.z0 + 2.5) { outAt = i; dir = yawDeg; break; }
        }
        h.input.releaseAll();
        x = h.player.get().position.x;
        if (outAt >= 0) break;
      }
      return { outAt, dir, x };
    }, ge);
    expect(out.outAt, `柱の 外へ 出られた（x = ${out.x}）`).toBeGreaterThanOrEqual(0);
    expect(errs).toEqual([]);
  });

  test('少女の 間も すりガラスは 刀で 割れる(体に はじかれても ガラスは 割れる)。割れた 下で はさまらない', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await loadGirl(page);
    await takeKatana(page, 'chudan');
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    expect(await page.evaluate(() => (window as any).__gg.untilForm('laugh'))).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => { (window as any).__rikkun.gasha.bigTune.glass.regenDelaySec = 1e6; });
    expect(await swingAtSomeGlass(page), 'どれかの 雲が 割れた').toBe(true);
    await standInGeyserUnderBody(page);
    const r = await pinnedFor(page, 120);
    expect(r.pinned).toBe(false);
    expect(errs).toEqual([]);
  });

  test('とどめの あと（倒れた 体）の すりガラスも 刀で 割れる', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await takeKatana(page, 'chudan');
    await page.evaluate(() => { (window as any).__rikkun.gasha.bigTune.glass.regenDelaySec = 1e6; });
    await swordKill(page);
    expect(await untilLie(page)).toBeGreaterThanOrEqual(0);
    expect(await swingAtSomeGlass(page), 'どれかの 雲が 割れた').toBe(true);
    expect(errs).toEqual([]);
  });
});

// ---------------------------------------------------------------- 3. BGM

test.describe('3. 少女が 肩で 休んで いる 間の BGM', () => {
  test('休んでいる 間も 欲しい 曲は「災厄」(saiyaku)。ふだんの 曲に もどらない', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await loadGirl(page);
    await page.evaluate((t) => (window as any).__gashaGirl.tune(t), FAST);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    const seated = await page.evaluate(() => {
      const w = window as any, gt = w.__gt;
      if (w.__gg.untilForm('perch') < 0) return false;
      return gt.until(() => w.__gashaGirl.phase() === 'perch', 900, () => gt.heal()) >= 0;
    });
    expect(seated).toBe(true);
    const r = await page.evaluate(() => {
      const w = window as any, gt = w.__gt, gg = w.__gg, out: any[] = [];
      for (let i = 0; i < 6; i++) { gt.run(120, () => gt.heal()); out.push(gg.bgm().desired); }
      return { desired: out, girlLock: gg.bgm().girlLock, suppressed: !!gg.bgm() };
    });
    expect(r.desired, '休み中').toEqual(Array(6).fill('saiyaku'));
    // 肩の 少女を とどめで たおしたら 止まる（ふだんの 曲に もどる）
    await page.evaluate(() => { const w = window as any; w.__gashaBig.damage('girl', 1e6); w.__rikkun.step(3); });
    expect((await page.evaluate(() => (window as any).__gg.bgm().desired)), 'たおしたら 止める').toBeNull();
    expect(errs).toEqual([]);
  });
});

// ---------------------------------------------------------------- 4. コアの ふり落とし（ワープなしの 放射状）

const THROW = BT.core.throwOff;

for (const where of ['back', 'side', 'front'] as const) {
  test(`4. コアを なぐると コアから 遠ざかる 向きに とぶ（${where === 'back' ? '背中の 道' : where === 'side' ? '側面の 穴' : '正面'}がわ）。ワープしない`, async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: false, distance: 60 });
    await page.evaluate(() => { const c = (window as any).__rikkun.gasha.bigTune.core.throwOff; c.warnSec = 0.05; });
    const start = await page.evaluate((where) => {
      const w = window as any, gt = w.__gt, g = gt.big(), h = gt.h;
      const core = g.colliders().find((q: any) => q.name === 'core');
      const cx = core.center[0] as number, cy = core.center[1] as number, cz = core.center[2] as number;
      const yaw = (gt.boss().yawDeg * Math.PI) / 180;
      const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) }, left = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const dir = where === 'back' ? { x: -fwd.x, z: -fwd.z } : where === 'front' ? { x: fwd.x, z: fwd.z } : { x: left.x, z: left.z };
      // コアから その 向きへ、体の 外(がわ)の 空いた 場所を さがす（遠い 方から）
      let spot: { x: number; y: number; z: number; d: number } | null = null;
      const range = where === 'back' ? [3, 5, 7, 9, 11, 13] : [14, 12, 10, 9, 8, 7, 6, 5];
      for (const d of range) {
        const x = cx + dir.x * d, z = cz + dir.z * d, y = cy - 0.5;
        const free = [0, 1, 2].every((k) => !g.solidAt(x, y + k * 0.9, z)) && !g.solidAt(x, y - 0.2, z);
        if (free) { spot = { x, y, z, d }; break; }
      }
      if (!spot) return null;
      h.player.set({ position: { x: spot.x, y: spot.y, z: spot.z }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(1);
      const p = h.player.get().position;
      return { x: p.x as number, y: p.y as number, z: p.z as number, core: { x: cx, y: cy, z: cz }, d: spot.d };
    }, where);
    expect(start, '立てる 場所').not.toBeNull();
    const r = await page.evaluate(() => {
      const w = window as any, gt = w.__gt, g = gt.big(), h = gt.h;
      const p0 = h.player.get().position;
      const s = { x: p0.x as number, y: p0.y as number, z: p0.z as number };
      let prev = { ...s }, maxStep = 0, throwSeen = false;
      g.damage('core', 1);
      for (let i = 0; i < 200; i++) {
        gt.heal(); h.step(1);
        const p = h.player.get().position;
        maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.z - prev.z));
        prev = { x: p.x, y: p.y, z: p.z };
        if (g.info().coreWarn.throwLeft > 0) throwSeen = true;
      }
      return { s, e: prev, maxStep, throwSeen, hp: g.hp() };
    });
    expect(r.throwSeen, 'とばされた').toBe(true);
    const rx = r.s.x - start!.core.x, rz = r.s.z - start!.core.z, rl = Math.hypot(rx, rz) || 1;
    const dx = r.e.x - r.s.x, dz = r.e.z - r.s.z, dl = Math.hypot(dx, dz);
    expect(r.maxStep, `1 コマで 大きく 動かない（ワープなし。最大 ${r.maxStep.toFixed(2)}）`).toBeLessThan(1.5);
    expect(dl, '遠くまで とぶ').toBeGreaterThan(THROW.speed * THROW.blockSec * 0.8);
    expect((dx * rx + dz * rz) / (dl * rl), 'コアから 遠ざかる 向き').toBeGreaterThan(0.85);
    expect(errs).toEqual([]);
  });
}

// ---------------------------------------------------------------- 5. 少女の 間は 体もコアも ダメージ 0

test.describe('5. 少女の 間は 大きな 姿の 体・コアは ダメージ 0（はじく）。肩の 少女だけ 通る', () => {
  test('笑って いる 間・肩で 休む 間: コア・手・頭 を たたいても 体力は へらず、ふり落としも 起きない。肩の 少女は 通る', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await loadGirl(page);
    await page.evaluate((t) => (window as any).__gashaGirl.tune(t), FAST);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    expect(await page.evaluate(() => (window as any).__gg.untilForm('laugh'))).toBeGreaterThanOrEqual(0);
    const hit = (): Promise<{ hp: number; warn: number; deflects: number }> => page.evaluate(() => {
      const w = window as any, g = w.__gashaBig, hp0 = g.hp();
      for (const part of ['core', 'hand', 'head', 'upperArm']) g.damage(part, 50);
      w.__rikkun.step(120);
      const i = g.info();
      return { hp: hp0 - g.hp(), warn: i.coreWarn.warnLeft + i.coreWarn.throwLeft, deflects: i.deflects };
    });
    const a = await hit();
    expect(a.hp, '笑って いる 間').toBe(0);
    expect(a.warn, 'ふり落としは 起きない').toBe(0);
    expect(a.deflects, 'はじいた').toBeGreaterThan(0);
    await page.evaluate(() => { const w = window as any, gt = w.__gt; if (w.__gg.untilForm('perch') < 0) throw new Error('perch'); gt.until(() => w.__gashaGirl.phase() === 'perch', 900, () => gt.heal()); });
    const b = await hit();
    expect(b.hp, '肩で 休む 間').toBe(0);
    expect(b.warn).toBe(0);
    const girl = await page.evaluate(() => { const g = (window as any).__gashaBig, hp0 = g.hp(); g.damage('girl', 5); return hp0 - g.hp(); });
    expect(girl, '肩の 少女は 通る').toBeGreaterThan(0);
    expect(errs).toEqual([]);
  });

  test('少女の 前（大きな 姿の 間）と とどめの あと（赤い コア）は ふつうに 通る', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: false, distance: 60 });
    await quickCore(page, 3);
    const big = await page.evaluate(() => { const g = (window as any).__gashaBig, hp0 = g.hp(); g.damage('hand', 50); return hp0 - g.hp(); });
    expect(big, '大きな 姿の 間').toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__rikkun.gasha.defeat());
    expect(await untilLie(page)).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => { const w = window as any; w.__gashaBig.damage('core', 1); w.__rikkun.step(5); });
    expect(await page.evaluate(() => (window as any).__gashaBig.finishInfo().coreHp), 'コアが たたける').toBe(2);
    expect(errs).toEqual([]);
  });

  test('コアが 虹色の バリアに 守られて いる: 少女の 間だけ 張られ、たたくと 波紋、とどめの あと 消える', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await setupBoss(page, { walk: true, distance: 60 });
    await loadGirl(page);
    const barrier = (): Promise<{ on: boolean; ripples: number; radius: number }> => page.evaluate(() => (window as any).__gashaBig.barrier());
    expect((await barrier()).on, '大きな 姿の 間は なし').toBe(false);
    await page.evaluate(() => (window as any).__gg.hpTo(0.3));
    expect(await page.evaluate(() => (window as any).__gg.untilForm('laugh'))).toBeGreaterThanOrEqual(0);
    const on = await barrier();
    expect(on.on, '少女が 出たら 張る').toBe(true);
    expect(on.radius).toBe(BT.freeze.barrier.radius);
    expect(on.ripples).toBe(0);
    await page.evaluate(() => { const w = window as any; w.__gashaBig.damage('core', 50); w.__rikkun.step(2); });
    expect((await barrier()).ripples, 'たたくと 波紋').toBeGreaterThan(0);
    await page.evaluate(() => { const w = window as any; w.__rikkun.step(Math.ceil(60 * 3)); });
    expect((await barrier()).ripples, '波紋は 消える').toBe(0);
    await page.evaluate(() => { const w = window as any; w.__gashaBig.damage('girl', 1e6); w.__rikkun.step(30); });
    expect((await barrier()).on, 'とどめで 消える').toBe(false);
    expect(errs).toEqual([]);
  });
});
