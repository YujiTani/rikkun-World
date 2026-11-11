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
}

async function needMine(page: Page, names: string[]): Promise<void> {
  const have = await page.evaluate((names) => names.filter((n) => typeof (window as any).__rikkun?.mine?.[n] === 'function'), names);
  expect(have, '__rikkun.mine の 窓口〔1F〕').toEqual(names);
}

const state = (page: Page, id: string) => page.evaluate((id) => (window as any).__rikkun.mine.yakataState(id) as { state: string; left: number; foes: number[]; floating: unknown[] | null }, id);
const bag = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const s of (window as any).__rikkun.inventory.get().slots as ({ item: string; count: number } | null)[]) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
    return out;
  });

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
      return { id: s.id, stand, yaw, cells };
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
  await expect(label, 'のこりの 札').toContainText(String(total));
  const scene0 = await page.evaluate(() => (window as any).__rikkun.audio.state().yakataScene as string);
  expect(['waiting', 'challenge'], '場面').toContain(scene0);
  expect(scene0, 'あけた すぐ あとは 挑戦の 曲に しない').toBe('waiting');

  // --- F16 場面: 出現音の あと 挑戦の 曲 → 和音 Dm ---
  const delaySteps = Math.ceil(sound.challengeDelaySec * 60);
  await page.evaluate((n) => (window as any).__rikkun.step(n + 120), delaySteps);
  const au = await page.evaluate(() => {
    const a = (window as any).__rikkun.audio;
    return { scene: a.state().yakataScene as string, chord: a.chord() as { root?: string; minor?: boolean } | string };
  });
  expect(au.scene, '挑戦の 曲').toBe('challenge');
  expect(JSON.stringify(au.chord), 'やかたの 間は Dm').toMatch(/D/);

  // --- F15: 札の 位置〔3 つの 大きさ〕 ---
  for (const [w, h] of [[1280, 720], [1024, 640], [800, 600]]) {
    await page.setViewportSize({ width: w!, height: h! });
    const box = await label.boundingBox();
    expect(box, `札〔${w}x${h}〕`).not.toBeNull();
    expect(box!.x, '左が 切れない').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, '右が 切れない').toBeLessThanOrEqual(w!);
    expect(box!.y, '上が 切れない').toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, '上の ほう').toBeLessThanOrEqual(h! * 0.3);
    expect(Math.abs(box!.x + box!.width / 2 - w! / 2), '上の まん中').toBeLessThanOrEqual(w! * 0.1);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

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
      h.yokai.setHp(id, 0);
      h.step(5);
    }
    h.step(120);
  }, st.foes);
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
  expect(gained, '持ち物が プレビューの とおり ふえる').toEqual(want);
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
