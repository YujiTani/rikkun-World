import { expect, test, type Page } from '@playwright/test';
import { aimAtBlock, installAimHelpers } from './helpers/aim';
import { drainRebuilds, openStream, settleWorld } from './helpers/stream';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.7・§6.1・受け入れ基準 F14・F15・F16〔場面の 時間〕）: 通し 1 本。
 *
 *   F14: 新しい 世界 → `mine.shafts` から やかたの ある 坑道を さがす → 宝箱の 前〔上の 段の 前の まん中〕に 置く → 右クリック →
 *        門が ふさがり 妖怪 7 体・のこりの 札「7」〔出現音 1 回・ずずん 1 回〕→ 1 ぴき たおす → 札「6」→ 体力を 0 に → やられて 復活・宝箱 しまる・門 ひらく・`yakataState` が mada →
 *        もう いちど 宝箱の 前へ → あける → 7 ひき ぜんぶ たおす → 門 ひらく・持ち物が `chestPreview` の とおり ふえる・実績「ようかいの やかた を かちぬいた！」。
 *   F15: のこりの 札が 3 つの 大きさで 画面の 上の まん中・切れない〔重なりの くわしい 検査は UI 検査ゲート〕。
 *   F16〔場面〕: `audio.state().yakataScene` が waiting → 出現音の 3.4 秒 あと〔`yakataSoundTable().challengeDelaySec`〕に challenge・やかたの 間は `audio.chord()` が Dm・かち で none。
 *
 * 【テスト側の 読み】のこりの 札は `[data-testid="yakata-left"]`〔文字が 数だけ ふくまれる〕。実績は openStream が mute するので `achievements.mute(false)` で 解除して、見たら また mute する。
 * 数・座標・向きは ゲームの 窓口〔`mine.*`・`yokai.*`・`combat.*`〕に 聞く。時間〔ms〕では 合否を 決めない。手元では 回さない〔CI で 見る〕。
 * 赤の 確かめ: 1F の 前は やかたが なく「やかたの ある 坑道が ある」で 落ちる。
 */
test.describe.configure({ timeout: 900_000 });

const WIN = 'ようかいの やかた を かちぬいた！';
const norm = (s: string): string => s.replace(/\s+/g, '');

interface Pt {
  x: number;
  y: number;
  z: number;
}
interface Found {
  id: string;
  stand: Pt;
  yaw: number;
  cells: Pt[];
  gate: { x0: number; y: number; z0: number; x1: number; z1: number };
}

async function needMine(page: Page, names: string[]): Promise<void> {
  const have = await page.evaluate((names) => names.filter((n) => typeof (window as any).__rikkun?.mine?.[n] === 'function'), names);
  expect(have, '__rikkun.mine の 窓口〔1F〕').toEqual(names);
}

const state = (page: Page, id: string) => page.evaluate((id) => (window as any).__rikkun.mine.yakataState(id) as { state: string; left: number; foes: number[]; floating: unknown[] | null }, id);
const bag = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const s of (window as any).__rikkun.inventory.get().slots as ({ item: string; count: number } | null)[]) if (s && s.item !== 'yokai_orb') out[s.item] = (out[s.item] ?? 0) + s.count; // TOWN-1 1A: 実績の ようかいダマ（仕様 §2.4）は 数えない（中身の くらべに まぜない）
    return out;
  });

/** n ステップ すすめる。1 ステップ ごとに 体力を 全回復〔7 ひきの 攻撃は とめない。待つ 間に やられて mada に もどらない ため〕 */
const stepSafe = (page: Page, n: number): Promise<void> =>
  page.evaluate((n) => {
    const h = (window as any).__rikkun;
    for (let i = 0; i < n; i++) {
      const c = h.combat.get();
      h.combat.setHp(c.maxHp ?? 20);
      h.step(1);
    }
  }, n);
const isDm = (c: any): boolean => c === 'Dm' || c?.name === 'Dm' || (c?.root === 2 && c?.minor === true); // BgmChord = { name, root, minor }
/** 門の マス〔長方形 × 表の 高さ〕が すべて air か。`gate` は 探した ときに とっておく */
const gateAir = (page: Page, f: Found): Promise<{ air: number; cells: number }> =>
  page.evaluate((gate) => {
    const h = (window as any).__rikkun;
    const hgt = h.mine.yakataTable().gate.height as number;
    let air = 0;
    let cells = 0;
    for (let x = gate.x0; x <= gate.x1; x++) for (let z = gate.z0; z <= gate.z1; z++) for (let y = gate.y; y < gate.y + hgt; y++) {
      cells++;
      if (h.world.getBlock(x, y, z) === 'air') air++;
    }
    return { air, cells };
  }, f.gate);

/** 宝箱の 前〔上の 段・前の まん中〕に 立って 宝箱を ねらい 右クリック */
async function openChest(page: Page, f: Found): Promise<void> {
  await page.evaluate(({ x, z }) => (window as any).__rikkun.world.teleport(x, z), { x: f.stand.x, z: f.stand.z });
  await settleWorld(page, true);
  await page.evaluate(({ f }) => {
    const h = (window as any).__rikkun;
    h.player.set({ position: { x: f.stand.x + 0.5, y: f.stand.y, z: f.stand.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: f.yaw, pitch: 0 });
    h.step(10);
  }, { f });
  await drainRebuilds(page);
  const c = f.cells[0]!;
  await aimAtBlock(page, c.x, c.y, c.z, 0.5);
  const aimed = await page.evaluate(() => (window as any).__rikkun.target.get()?.block as Pt | undefined);
  expect(f.cells.some((q) => q.x === aimed?.x && q.y === aimed?.y && q.z === aimed?.z), 'ねらいが 宝箱に 乗った').toBe(true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('secondary');
    h.step(2);
    h.input.release('secondary');
  });
}

test('F14: やかたを さがす → あける → 7 ひき・札 7 → 1 ぴき 札 6 → やられる → もういちど → ぜんぶ たおす → 門 ひらく・持ち物・実績', async ({ page }) => {
  await openStream(page, '?nosave=1');
  await needMine(page, ['shafts', 'yakataTable', 'yakataSoundTable', 'yakataState', 'yakataFoes', 'yakataPlanFor']);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.lock.simulate(true);
    h.input.releaseAll();
    h.yokai.clear();
    h.inventory.clear();
  });

  // --- やかたの ある 坑道を さがす〔スタートに 近い 順〕 ---
  const found = await page.evaluate((): Found | null => {
    const h = (window as any).__rikkun;
    const sp = h.world.spawn();
    for (const half of [1536, 3072, 4096]) {
      const list = (h.mine.shafts(sp.x - half, sp.z - half, sp.x + half - 1, sp.z + half - 1) as any[])
        .filter((s) => s.gen === 'e' && s.yakata)
        .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z));
      const s = list[0];
      if (!s) continue;
      const y = s.yakata;
      const cells = y.chest.cells as Pt[];
      const front = ({ n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as Record<string, number[]>)[y.chest.front]!;
      const cx = cells.reduce((a, p) => a + p.x, 0) / cells.length;
      const cz = cells.reduce((a, p) => a + p.z, 0) / cells.length;
      const stand = { x: Math.round(cx + front[0]!), y: y.altar.y + 1, z: Math.round(cz + front[1]!) };
      const yaw = (Math.atan2(-front[0]!, front[1]!) * 180) / Math.PI;
      return { id: s.id, stand, yaw, cells, gate: y.gate };
    }
    return null;
  });
  expect(found, 'やかたの ある 坑道が ある').not.toBeNull();
  const f = found!;
  const T = await page.evaluate(() => (window as any).__rikkun.mine.yakataTable() as { oyabun: number; taisho: number; nushi: number });
  const sound = await page.evaluate(() => (window as any).__rikkun.mine.yakataSoundTable() as { challengeDelaySec: number });
  const total = T.oyabun + T.taisho + T.nushi;
  expect(total, '7 ひき〔表の 数の 合計〕').toBeGreaterThan(0);
  const preview = await page.evaluate((id) => (window as any).__rikkun.mine.yakataPlanFor(id)?.chestPreview as { item: string; count: number }[] | undefined, f.id);
  expect(preview?.length, '宝箱の プレビュー').toBeGreaterThan(0);
  const bagBefore = await bag(page);

  // --- 1 回目: あける → 門・7 ひき・札 ---
  await page.evaluate(() => (window as any).__rikkun.achievements.mute(false));
  await openChest(page, f);
  await page.evaluate(() => (window as any).__rikkun.step(2));
  let st = await state(page, f.id);
  expect(st.state, 'あけた コマで chosen').toBe('chosen');
  expect(st.left, 'のこり').toBe(total);
  expect(st.foes, '妖怪の id').toHaveLength(total);
  expect(await bag(page), '持ち物は かわらない').toEqual(bagBefore);
  const label = page.locator('[data-testid="yakata-left"]');
  const g1 = await gateAir(page, f);
  expect(g1.air, '門が ふさがった').toBe(0);
  await expect(label, 'のこりの 札').toContainText(String(total));
  const scene0 = await page.evaluate(() => (window as any).__rikkun.audio.state().yakataScene as string);
  expect(['waiting', 'challenge'], '場面').toContain(scene0);
  expect(scene0, 'あけた すぐ あとは 挑戦の 曲に しない').toBe('waiting');

  // --- F15: 札の 位置・ほかの 部品と 重ならない〔3 つの 大きさ。はじまりの おしらせは 3 秒 だけ ので すぐ 見る〕 ---
  for (const [w, h] of [[1280, 720], [1024, 640], [800, 600]]) {
    await page.setViewportSize({ width: w!, height: h! });
    const box = await label.boundingBox();
    expect(box, `札〔${w}x${h}〕`).not.toBeNull();
    expect(box!.x, '左が 切れない').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, '右が 切れない').toBeLessThanOrEqual(w!);
    expect(box!.y, '上が 切れない').toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, '上の ほう').toBeLessThanOrEqual(h! * 0.3);
    expect(Math.abs(box!.x + box!.width / 2 - w! / 2), '上の まん中').toBeLessThanOrEqual(w! * 0.1);
    for (const sel of ['#hearts', '#hotbar', '#notice-name']) {
      const o = page.locator(sel);
      if (sel !== '#notice-name') await expect(o.first(), `${sel} が 見えて いる〔${w}x${h}〕`).toBeVisible();
      else if ((await o.count()) === 0 || !(await o.first().isVisible())) continue; // はじまりの おしらせは 3 秒 だけ
      const ob = await o.first().boundingBox();
      if (!ob) continue;
      const cross = box!.x < ob.x + ob.width && ob.x < box!.x + box!.width && box!.y < ob.y + ob.height && ob.y < box!.y + box!.height;
      expect(cross, `札と ${sel} が かさならない〔${w}x${h}〕`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // --- F16 場面: 出現音の あと 挑戦の 曲 → 和音 Dm ---
  const delaySteps = Math.ceil(sound.challengeDelaySec * 60);
  await stepSafe(page, delaySteps + 120);
  const au = await page.evaluate(() => {
    const a = (window as any).__rikkun.audio;
    return { scene: a.state().yakataScene as string, chord: a.chord() as { root?: string; minor?: boolean } | string };
  });
  expect(au.scene, '挑戦の 曲').toBe('challenge');
  expect(isDm(au.chord), `やかたの 間は Dm〔${JSON.stringify(au.chord)}〕`).toBe(true);

  // --- 1 ぴき たおす → 札 ---
  await page.evaluate((id) => {
    const h = (window as any).__rikkun;
    h.yokai.setHp(id, 0);
    h.step(30);
  }, st.foes[0]!);
  st = await state(page, f.id);
  expect(st.left, '1 ぴき たおして のこり').toBe(total - 1);
  await expect(label).toContainText(String(total - 1));

  // --- 体力 0 → やられて 復活・宝箱 しまる・門 ひらく ---
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.inventory.clear(); // やられても おとしものぶくろを 出さない〔あとで ひろって 数が ずれない ため〕
    h.combat.setHp(0);
    h.step(10);
  });
  const revived = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let i = 0; i < 900; i++) {
      h.step(1);
      const c = h.combat.get();
      if (!c.dead && c.hp > 0) return true;
    }
    return false;
  });
  expect(revived, '復活した').toBe(true);
  st = await state(page, f.id);
  expect(st.state, 'まけて mada').toBe('mada');
  expect(st.floating, 'うかぶ 中身 なし').toBeNull();
  expect(await page.evaluate(() => (window as any).__rikkun.yokai.list().filter((y: any) => y.title && y.title !== 'none').length), '二つ名の 妖怪は 消えた').toBe(0);
  const g2 = await gateAir(page, f);
  expect(g2.air, 'まけて 門が ひらいた').toBe(g2.cells);

  // --- 2 回目: あける → ぜんぶ たおす ---
  await openChest(page, f);
  await page.evaluate(() => (window as any).__rikkun.step(2));
  st = await state(page, f.id);
  expect(st.state).toBe('chosen');
  expect(st.left).toBe(total);
  const bagMid = await bag(page);
  await page.evaluate((ids) => {
    const h = (window as any).__rikkun;
    for (const id of ids) {
      h.combat.setHp(h.combat.get().maxHp ?? 20);
      h.yokai.setHp(id, 0);
      h.step(5);
    }
  }, st.foes);
  await stepSafe(page, 120);
  st = await state(page, f.id);
  expect(st.state, 'かった').toBe('katta');
  expect(st.left).toBe(0);
  await drainRebuilds(page);
  const bagAfter = await bag(page);
  const want: Record<string, number> = {};
  for (const it of preview!) want[it.item] = (want[it.item] ?? 0) + it.count;
  const gained: Record<string, number> = {};
  for (const id of new Set([...Object.keys(bagAfter), ...Object.keys(bagMid)])) {
    const d = (bagAfter[id] ?? 0) - (bagMid[id] ?? 0);
    if (d !== 0) gained[id] = d;
  }
  // 二つ名の おとし物〔ふつうの 表〕も ひろう ので、中身は「ぜんぶ ふえた」〔以上〕で 見る
  for (const [item, n] of Object.entries(want)) expect(gained[item] ?? 0, `${item} が プレビューの 数 以上 ふえる`).toBeGreaterThanOrEqual(n);
  const g3 = await gateAir(page, f);
  expect(g3.air, 'かって 門が ひらいた').toBe(g3.cells);
  const unlocked = await page.evaluate((name) => (window as any).__rikkun.achievements.list().filter((a: any) => String(a.name).replace(/\s+/g, '') === name).map((a: any) => a.unlocked as boolean), norm(WIN));
  expect(unlocked, `実績「${WIN}」`).toEqual([true]);
  const sceneEnd = await page.evaluate(() => (window as any).__rikkun.audio.state().yakataScene as string);
  expect(sceneEnd, 'かった あとは ふんいきも 鳴らさない').toBe('none');
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.flush();
    h.achievements.mute(true);
  });
});
