import { expect, test, type Page } from '@playwright/test';
import { aimAtBlock, installAimHelpers } from './helpers/aim';
import { drainRebuilds, openStream, settleWorld } from './helpers/stream';

/**
 * MINE-1C（issue #350。docs/design/MINE-1.md §4.5・§4.6・§4.8・§4.10・§6.1・受け入れ基準 C12・C13）: 通し 2 本。
 *
 *   C12 通し 1: 新しい 世界 → はじまりの 坑道の 入口の 前へ → 入口へ 向いて 前へ〔W〕を 300 ステップ →
 *       足が 坑道の 中〔`mine.caveAt` が 'kodo'〕・落下ダメージ 0・足もとの ブロックの 光 6 以上。
 *   C13 通し 2【3 版】: 新しい 世界で `mine.shafts` から 宝箱の ある 坑道を さがす → いちばん 下の へやに 置く →
 *       `mine.chestPreview` を 読む → 宝箱の「本体で ない ほうの マス」を 右クリック〔secondary〕→ 持ち物が プレビューの とおり ふえる・
 *       2 マス とも あいた 宝箱〔`mine.chestAt(...).opened`〕・実績「はじめて たからばこ を あけた！」→ セーブして 開きなおす →
 *       2 マス とも あいた まま・持ち物も そのまま・本体を もう 1 回 右クリックしても ふえない。
 *
 * 歩く 時間〔300 ステップ〕・右クリックの 長さは 仕様の とおりの ステップ数。時間〔ms〕では 合否を 決めない。座標・向き・個数は ゲームの 窓口に 聞く。
 *
 * 窓口〔仕様 §6.1〕: mine.startShaft／shafts／chestAt／chestPreview／caveAt、world.lightAt／teleport／settle、combat.get、save.now、
 *   inventory.get／count、achievements.list、input.press。名前の 案は src/world/gen/mineShaftKit.ts の 先頭。
 * 赤の 確かめ（テストの 準備）: 1C の 前は `mine.startShaft`／`mine.shafts` が 無く「窓口が ない」で 落ちる。
 */
test.describe.configure({ timeout: 180_000 });

const ACHIEVEMENT = 'はじめて たからばこ を あけた！';
/** 入口の 前に 立つ きょり〔入口から 外へ 何マスか。ふさがって いたら 近い 順に さがす〕 */
const FRONT = [6, 5, 7, 4, 8] as const;
const STEPS = 300;

interface Pt {
  x: number;
  y: number;
  z: number;
}
const OUT: Record<number, [number, number]> = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] }; // dir 0=n・1=e・2=s・3=w〔外むき〕
const FRONT_VEC: Record<string, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** 窓口が ある〔ない うちは 赤〕ことを 先に 見る */
async function needMine(page: Page, names: string[]): Promise<void> {
  const have = await page.evaluate((names) => names.filter((n) => typeof (window as any).__rikkun?.mine?.[n] === 'function'), names);
  expect(have, `__rikkun.mine の 窓口〔1C〕`).toEqual(names);
}

/** 列を 読みこませる: (x, z) へ テレポート → そろうまで 進める */
async function loadAround(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(({ x, z }) => (window as any).__rikkun.world.teleport(x, z), { x, z });
  await settleWorld(page, true);
}

test.describe('MINE-1C 通し', () => {
  test('C12: はじまりの 坑道の 入口の 前から 前へ 300 ステップ → 坑道の 中・落ちない・足もとが 明るい', async ({ page }) => {
    await openStream(page, '?nosave=1');
    await needMine(page, ['startShaft', 'caveAt']);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true);
      h.input.releaseAll();
      h.yokai.clear();
    });
    const ent = await page.evaluate(() => (window as any).__rikkun.mine.startShaft().entrance as Pt & { dir: number });
    const [ox, oz] = OUT[ent.dir]!;
    await loadAround(page, ent.x + ox * 6, ent.z + oz * 6);

    // --- 入口の 前に 立つ〔入口から 外へ 6 マス。外から 入口へ 向く〕 ---
    const start = await page.evaluate(
      ({ ent, ox, oz, dists }) => {
        const h = (window as any).__rikkun;
        const types = h.world.blockTypes() as { id: string; solid: boolean }[];
        const solid = new Set(types.filter((t) => t.solid).map((t) => t.id));
        const body = (x: number, y: number, z: number): boolean => {
          const id = h.world.getBlock(x, y, z) as string;
          return !solid.has(id) && id !== 'water';
        };
        for (const d of dists) {
          const x = ent.x + ox * d;
          const z = ent.z + oz * d;
          for (let y = ent.y + 6; y >= ent.y - 10; y--) {
            if (!solid.has(h.world.getBlock(x, y, z) as string)) continue;
            if (!body(x, y + 1, z) || !body(x, y + 2, z)) break; // 足と 頭が 入らない → 次の きょりへ
            const yaw = (Math.atan2(-ox, oz) * 180) / Math.PI; // 外から 入口へ〔内向き ＝ −外向き〕。yaw 0 ＝ −z・90 ＝ +x
            h.player.set({ position: { x: x + 0.5, y: y + 1, z: z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
            h.combat.setHp(h.combat.get().maxHp);
            h.step(10);
            const p = h.player.get().position;
            return { x: p.x, y: p.y, z: p.z, hp: h.combat.get().hp as number, max: h.combat.get().maxHp as number, cave: h.mine.caveAt(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z)) as string | null };
          }
        }
        return null;
      },
      { ent, ox, oz, dists: [...FRONT] },
    );
    expect(start, '入口の 前に 立てる 場所').not.toBeNull();
    expect(start!.cave, '立った 所は まだ 坑道の 外').not.toBe('kodo');

    // --- 前へ 300 ステップ〔10 ずつ。とちゅうの 体力も 見る〕 ---
    const walk = await page.evaluate(
      ({ steps }) => {
        const h = (window as any).__rikkun;
        const max = h.combat.get().maxHp as number;
        let minHp = max;
        let dead = false;
        h.input.press('moveForward');
        for (let i = 0; i < steps; i += 10) {
          h.step(10);
          const c = h.combat.get();
          minHp = Math.min(minHp, c.hp);
          dead ||= c.dead;
        }
        h.input.release('moveForward');
        h.step(2);
        return { minHp, max, dead };
      },
      { steps: STEPS },
    );
    expect(walk.dead, 'たおれない').toBe(false);
    expect(walk.minHp, '落下ダメージ 0〔体力が へらない〕').toBe(walk.max);

    await drainRebuilds(page); // 光の 計算が そろうまで
    const end = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const p = h.player.get().position;
      const x = Math.floor(p.x);
      const y = Math.floor(p.y + 0.1);
      const z = Math.floor(p.z);
      return { x, y, z, cave: h.mine.caveAt(x, y, z) as string | null, block: h.world.lightAt(x, y, z).block as number, startY: h.mine.startShaft().entrance.y as number };
    });
    expect(end.cave, `足が 坑道の 中〔(${end.x}, ${end.y}, ${end.z})〕`).toBe('kodo');
    expect(end.y, '入口より 下へ 進んだ').toBeLessThan(end.startY);
    expect(end.block, '足もとの ブロックの 光').toBeGreaterThanOrEqual(6);
  });

  test('C13: 宝箱の ある 坑道の へやで 本体で ない ほうの マスを 右クリック → プレビューの とおり ふえる・2 マス あく・実績 → 保存して 開きなおしても あいた まま・本体は もう ふえない', async ({ page }) => {
    await openStream(page, ''); // 保存を つかう〔「セーブして 開きなおす」〕。新しい 世界
    await needMine(page, ['shafts', 'chestAt', 'chestPreview']);
    await installAimHelpers(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true);
      h.input.releaseAll();
      h.yokai.clear();
      h.inventory.clear();
    });

    // --- 宝箱の ある 坑道を さがす〔スタートに 近い 順〕 ---
    const found = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const sp = h.world.spawn();
      const list = h.mine.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535) as { id: string; chest: { x: number; y: number; z: number; cells: Pt[]; front: string } | null; entrance: Pt }[];
      const withChest = list
        .filter((s) => s.chest)
        .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z));
      const s = withChest[0];
      return s ? { id: s.id, chest: s.chest! } : null;
    });
    expect(found, '宝箱の ある 坑道が スタートの まわりに ある').not.toBeNull();
    const chest = found!.chest;
    expect(chest.cells, '宝箱は 2 マス').toHaveLength(2);
    const main = { x: chest.x, y: chest.y, z: chest.z };
    const rest = chest.cells.find((c) => c.x !== main.x || c.y !== main.y || c.z !== main.z)!;
    expect(rest, '本体で ない ほうの マス').toBeTruthy();

    // --- いちばん 下の へやに 置く〔宝箱の 2 マス 前。まんなかに 立つ〕 ---
    await loadAround(page, main.x, main.z);
    const [fx, fz] = FRONT_VEC[chest.front]!;
    const put = await page.evaluate(
      ({ main, rest, fx, fz }) => {
        const h = (window as any).__rikkun;
        const cx = (main.x + rest.x) / 2 + 0.5 + fx * 2;
        const cz = (main.z + rest.z) / 2 + 0.5 + fz * 2;
        h.player.set({ position: { x: cx, y: main.y, z: cz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        h.step(10);
        const p = h.player.get().position;
        return { x: p.x, y: p.y, z: p.z, cave: h.mine.caveAt(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z)) as string | null };
      },
      { main, rest, fx, fz },
    );
    expect(put.cave, '宝箱の 前は 坑道の 中').toBe('kodo');
    await drainRebuilds(page);

    // --- あける 前: プレビュー・まだ あいて いない ---
    const before = await page.evaluate(
      ({ main, rest }) => {
        const h = (window as any).__rikkun;
        return {
          preview: h.mine.chestPreview(main.x, main.y, main.z) as { tier: number; items: { item: string; count: number }[] } | null,
          previewRest: h.mine.chestPreview(rest.x, rest.y, rest.z) as { tier: number; items: { item: string; count: number }[] } | null,
          mainInfo: h.mine.chestAt(main.x, main.y, main.z) as { opened: boolean; main: Pt } | null,
          restInfo: h.mine.chestAt(rest.x, rest.y, rest.z) as { opened: boolean; main: Pt } | null,
        };
      },
      { main, rest },
    );
    expect(before.preview, 'プレビュー').not.toBeNull();
    expect(before.preview!.items.length, '中身').toBeGreaterThan(0);
    expect(before.previewRest, 'どちらの マスで 読んでも 同じ 中身').toEqual(before.preview);
    expect(before.mainInfo?.opened, '本体: まだ').toBe(false);
    expect(before.restInfo?.opened, 'のこりの マス: まだ').toBe(false);
    expect(before.restInfo?.main, 'のこりの マスの 本体').toEqual(main);
    const rows = await page.evaluate((name) => (window as any).__rikkun.achievements.list().filter((a: any) => a.name === name).map((a: any) => a.unlocked as boolean), ACHIEVEMENT);
    expect(rows, `実績「${ACHIEVEMENT}」の 行`).toHaveLength(1);
    expect(rows[0], '最初は まだ').toBe(false);

    // --- 右クリック〔本体で ない ほうの マスを ねらう〕 ---
    const want = new Map<string, number>();
    for (const it of before.preview!.items) want.set(it.item, (want.get(it.item) ?? 0) + it.count);
    const bag = (): Promise<Record<string, number>> =>
      page.evaluate(() => {
        const out: Record<string, number> = {};
        for (const s of (window as any).__rikkun.inventory.get().slots as ({ item: string; count: number } | null)[]) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
        return out;
      });
    expect(await bag(), '持ち物は からっぽ').toEqual({});
    const click = async (at: Pt): Promise<{ aimed: Pt | null }> => {
      await aimAtBlock(page, at.x, at.y, at.z, 0.5);
      return page.evaluate(() => {
        const h = (window as any).__rikkun;
        const t = h.target.get();
        h.input.press('secondary');
        h.step(2);
        h.input.release('secondary');
        h.step(30); // 持ち物に 入る まで
        return { aimed: t ? (t.block as Pt) : null };
      });
    };
    const first = await click(rest);
    expect(first.aimed, 'ねらいが のこりの マスに 乗った').toEqual(rest);
    const got = await bag();
    expect(got, '持ち物が プレビューの とおり ふえる').toEqual(Object.fromEntries(want));

    const after = await page.evaluate(
      ({ main, rest, name }) => {
        const h = (window as any).__rikkun;
        return {
          mainOpened: h.mine.chestAt(main.x, main.y, main.z)?.opened as boolean | undefined,
          restOpened: h.mine.chestAt(rest.x, rest.y, rest.z)?.opened as boolean | undefined,
          unlocked: h.achievements.list().filter((a: any) => a.name === name).map((a: any) => a.unlocked as boolean),
        };
      },
      { main, rest, name: ACHIEVEMENT },
    );
    expect(after.mainOpened, '本体も あく').toBe(true);
    expect(after.restOpened, 'のこりの マスも あく').toBe(true);
    expect(after.unlocked, `実績「${ACHIEVEMENT}」`).toEqual([true]);

    // --- セーブして 開きなおす ---
    await page.evaluate(() => (window as any).__rikkun.save.now());
    await page.reload();
    await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.mute(true);
      h.pause();
      h.settings.set('yokaiAutoSpawn', false);
      h.lock.simulate(true);
    });
    await settleWorld(page, true);
    await installAimHelpers(page);

    const reopened = await page.evaluate(
      ({ main, rest }) => {
        const h = (window as any).__rikkun;
        return {
          mainOpened: h.mine.chestAt(main.x, main.y, main.z)?.opened as boolean | undefined,
          restOpened: h.mine.chestAt(rest.x, rest.y, rest.z)?.opened as boolean | undefined,
        };
      },
      { main, rest },
    );
    expect(reopened.mainOpened, '開きなおしても 本体は あいた まま').toBe(true);
    expect(reopened.restOpened, '開きなおしても のこりの マスも あいた まま').toBe(true);
    expect(await bag(), '持ち物も そのまま').toEqual(got);

    // --- 本体を もう 1 回 右クリック → ふえない ---
    await page.evaluate(() => (window as any).__rikkun.step(2)); // 開きなおした あとの 落ちつき
    // 手には 何も 持たない〔あいた 宝箱の 右クリックで 手の 物が 置かれる のとは べつの 話。ふえない ことだけ 見る〕
    const empty = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const slots = h.inventory.get().slots as ({ item: string } | null)[];
      const at = slots.findIndex((s) => s === null);
      if (at >= 0) h.inventory.select(at);
      return at;
    });
    expect(empty, '空の マス').toBeGreaterThanOrEqual(0);
    const second = await click(main);
    expect(second.aimed, 'ねらいが 本体に 乗った').toEqual(main);
    expect(await bag(), 'あいた 宝箱は もう ふえない').toEqual(got);
  });
});
