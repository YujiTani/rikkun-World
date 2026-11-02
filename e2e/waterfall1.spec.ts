import { expect, test } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { installArena } from './helpers/arena';

/**
 * WATERFALL-1（docs/design/WATERFALL-1.md §6 AC2・AC5・AC6）: わきどころを 作る・置く → 空中の わきどころから 滝 → たきつぼが できて 合計が かわらない
 * → マグマが 光って 流れ、水に ふれて こくようせきに なる。WF_SHOTS=dir で 画面を のこす。
 * 場所: 床 `__arena.floor`（y=8 の 石、上面 y=9）。たきつぼの 池は (12, 9, 12) を まん中に 5×5（ふちは 石 1 だん、床は つち）。
 * 時間（ms）で 合否を 決めない。たきつぼが できる ステップは シードで 決まる ので 上限 まで すすめる。
 */
test('WATERFALL-1: わきどころ → 滝 → たきつぼ（量 かわらない）・マグマ → こくようせき', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await installArena(page);
  await installAimHelpers(page);
  const dir = process.env.WF_SHOTS;
  const shot = async (name: string) => {
    if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
  };

  // 1) 場所・作る・置く
  const made = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(12000);
    (window as any).__arena.floor(0, 0, 26, 26);
    h.water.pause(false);
    for (let n = 0; h.water.queue() > 0 && n < 3000; n++) h.step(1);
    h.inventory.clear();
    h.inventory.add('stone', 4);
    h.inventory.add('crystal', 1);
    const r = h.craft.make('wakimizu');
    h.step(2);
    return { ok: r.ok, have: h.inventory.count('wakimizu') as number };
  });
  expect(made.ok).toBe(true);
  expect(made.have).toBe(1);

  // 置く: 足もとの 前の 床（上面）を ねらって 右クリック → 床の 上に わきどころ（よこに 水を 出す）
  const placed = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.inventory.clear();
    h.inventory.add('wakimizu', 1); // 作った 1 こ と 同じ（スロット 0 に そろえる）
    h.inventory.select(0);
    (window as any).__springs0 = h.water.springCount(); // 自然の 滝（生成）の わきどころも 数に 入る ので 置く 前と くらべる
    h.player.set({ position: { x: 20.5, y: 9, z: 20.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -40 });
    h.step(2);
    (window as any).__aim.solve(20, 8, 18, 1);
    h.step(1);
    h.input.press('secondary');
    h.step(1);
    h.input.release('secondary');
    h.step(2);
    return { block: h.world.getBlock(20, 9, 18) as string, left: h.inventory.count('wakimizu') as number, springs: (h.water.springCount() - (window as any).__springs0) as number };
  });
  expect(placed.block).toBe('wakimizu');
  expect(placed.left).toBe(0);
  expect(placed.springs).toBe(1);

  // 2) 空中の わきどころ（y=20）から 滝。池は 5×5（ふち 石、床 つち）
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.world.setBlock(20, 9, 18, 'air'); // さっきの わきどころは かたづける
    for (let n = 0; h.water.queue() > 0 && n < 3000; n++) h.step(1);
    h.world.fill(9, 9, 9, 15, 9, 15, 'stone');
    h.world.fill(10, 9, 10, 14, 9, 14, 'air');
    h.world.fill(10, 8, 10, 14, 8, 14, 'dirt');
    h.world.setBlock(12, 20, 12, 'wakimizu');
    // WAKIDOKORO §5: わきどころは 5 方向に 出る。東西南北を いしで ふさいで 下 だけに 落とす
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) h.world.setBlock(12 + dx, 20, 12 + dz, 'stone');
    h.player.set({ position: { x: 12.5, y: 9, z: 2.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 180, pitch: 18 });
  });
  const formed = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let s = 0; s < 15 * 600; s++) {
      h.step(1);
      if (h.world.getBlock(12, 8, 12) === 'takitsubo') return s;
    }
    return -1;
  });
  expect(formed, 'たきつぼが できた').toBeGreaterThan(0);
  await page.evaluate(() => (window.__rikkun as any).step(60));
  await shot('1-waterfall-flow');
  const loop = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const box = [9, 9, 9, 15, 19, 15];
    const link = h.water.springLink(12, 20, 12);
    const t0 = h.water.total(...box);
    const totals: number[] = [];
    for (let k = 0; k < 10; k++) {
      h.step(15 * 8);
      totals.push(h.water.total(...box));
    }
    let column = 0;
    for (let y = 9; y < 20; y++) if (h.water.amount(12, y, 12) > 0) column++;
    return { link, t0, totals, column };
  });
  expect(loop.link).toEqual({ x: 12, y: 8, z: 12 });
  expect(loop.t0).toBeGreaterThan(0);
  for (const t of loop.totals) expect(t).toBe(loop.t0);
  expect(loop.column, '滝の 列が とぎれない（出口 y=19 〜 床の 上 y=9）').toBe(11);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: 12.5, y: 13, z: 9.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 180, pitch: -55 });
    h.step(30);
  });
  await shot('2-takitsubo');

  // 3) マグマ: 床の くぼみ（x 3〜7・z 19〜21・y 8。下は 石）に マグマ 5 マス（量 8）。夜に 光る・ゆっくり 流れる。そのあと 水を 足すと こくようせき
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.world.fill(2, 7, 18, 8, 7, 22, 'stone');
    h.world.fill(3, 8, 19, 7, 8, 21, 'air');
    for (let x = 3; x <= 7; x++) h.water.magma.set(x, 8, 20, 8);
    h.time.set(67400); // 夜の 真ん中（光が 見える）
    h.player.set({ position: { x: 5.5, y: 9, z: 15.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 180, pitch: -38 });
    h.step(45 * 12);
  });
  const mag = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return { total: h.water.magma.total(3, 8, 19, 7, 8, 21) as number, spread: h.water.magma.amount(5, 8, 19) as number };
  });
  expect(mag.total).toBe(40);
  expect(mag.spread).toBeGreaterThan(0);
  await shot('3-magma');
  const stone = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.world.setBlock(8, 8, 20, 'air'); // くぼみの 東の はしに 水を 入れる あな
    h.water.set(8, 8, 20, 8);
    h.step(45 * 6);
    let obs = 0;
    for (let x = 3; x <= 7; x++) for (let z = 19; z <= 21; z++) if (h.world.getBlock(x, 8, z) === 'kokuyouseki') obs++;
    return { obs, water: h.water.total(3, 8, 19, 8, 9, 21) as number };
  });
  expect(stone.obs).toBeGreaterThan(0);
  expect(stone.water).toBe(8);
  await shot('4-magma-water-obsidian');
});

/**
 * WATERFALL-1 版 2: 新しい マグマ（黒い 地殻＋光る ひび）・ぐつぐつ マグマの コマ（時間で かわる）・こげた ブロック（とおくから 見て、ふむと 1 秒に 1）。
 * WF_SHOTS=dir で 画面を のこす（v2-*）。ぐつぐつ の 場所は 座標で きまる（15%）。8×6 の 池なら かならず ある。
 */
test('WATERFALL-1 版 2: ぐつぐつ マグマ・こげた ブロック', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await installArena(page);
  const dir = process.env.WF_SHOTS;
  const shot = async (name: string) => {
    if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
  };
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(67400);
    (window as any).__arena.floor(0, 0, 26, 26);
    h.water.pause(false);
    // 池 x 8〜15・z 10〜15（y 8。下と まわりは 石）
    h.world.fill(7, 7, 9, 16, 8, 16, 'stone');
    h.world.fill(8, 8, 10, 15, 8, 15, 'air');
    for (let x = 8; x <= 15; x++) for (let z = 10; z <= 15; z++) h.water.magma.set(x, 8, z, 8);
    h.player.set({ position: { x: 11.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 180, pitch: -40 });
    h.step(45 * 4);
  });
  await shot('v2-1-magma-new');
  // コマ: 5 コマ/秒 → 12 ステップごとに つぎの コマ
  for (let f = 0; f < 4; f++) {
    await page.evaluate(() => (window.__rikkun as any).step(12));
    await shot(`v2-2-boil-frame-${['a', 'b', 'c', 'd'][f]}`);
  }
  // こげた ブロック: 池の まわりの 石が 時間と ともに こげる
  const burned = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const count = (): number => {
      let n = 0;
      for (let x = 7; x <= 16; x++) for (let y = 7; y <= 8; y++) for (let z = 9; z <= 16; z++) if (h.world.getBlock(x, y, z) === 'kogeta') n++;
      return n;
    };
    const early = count();
    h.step(60 * 60);
    return { early, later: count(), magma: h.water.magma.total(8, 8, 10, 15, 8, 15) as number };
  });
  expect(burned.later).toBeGreaterThan(burned.early);
  expect(burned.later).toBeGreaterThan(10);
  expect(burned.magma).toBe(48 * 8);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.world.fill(8, 8, 10, 15, 8, 15, 'air'); // マグマを どけて こげた 床を 見せる
    h.time.set(12000);
    h.player.set({ position: { x: 11.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 180, pitch: -50 });
    h.step(10);
  });
  await shot('v2-3-kogeta');
  // ふむと 1 秒に 1（マグマとは べつ）
  const hurt = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.combat.setHp(20);
    let fx = -1;
    let fz = -1;
    for (let x = 8; x <= 15 && fx < 0; x++) for (let z = 10; z <= 15; z++) if (h.world.getBlock(x, 7, z) === 'kogeta') { fx = x; fz = z; break; }
    // まわりは 空気（となりの こげた かべに ふれない よう 1 マスの 上で しらべる）
    h.player.set({ position: { x: fx + 0.5, y: 8, z: fz + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    h.step(1);
    const a = h.combat.get().hp as number;
    h.step(60);
    const b = h.combat.get().hp as number;
    h.player.set({ position: { x: 20.5, y: 9, z: 20.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    h.step(120);
    return { found: fx >= 0, a, b, c: h.combat.get().hp as number };
  });
  expect(hurt.found).toBe(true);
  expect(hurt.a).toBe(19);
  expect(hurt.b).toBe(18);
  expect(hurt.c).toBe(18);
});
