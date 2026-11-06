import { expect, test } from '@playwright/test';
import { drainRebuilds, openStream, settleWorld } from './helpers/stream';

/**
 * MINE-1D（issue #351。docs/design/MINE-1.md §4.3・§4.7・§4.10・§6.1・受け入れ基準 D11）: 通し 1 本。
 *
 *   D11: 新しい 世界 → `mine.findCave('hotaru')` → その 部屋の 床に 置く → `mine.caveAt` が 'hotaru'・
 *        実績「はじめて ほたるの ほらあな を みつけた！」が 出る〔足が 部屋に 入った〕。
 *        ほたるの ほらあなの 床には 妖怪が 出ない〔D6 を つなぎ込みで 見る: 自動で 出した 妖怪の 出た 場所が 部屋の 床〔caveAt が 'hotaru'〕に 1 つも ない〕。
 *   3 版: 光の 確かめは やめた。時間〔ms〕では 合否を 決めない〔ステップ数だけ〕。座標・向き・個数は ゲームの 窓口に 聞く。
 *
 * 窓口〔仕様 §6.1〕: mine.findCave／caveAt／caves、world.teleport／settle、player.set／get、achievements.list、yokai.events／clear、settings.set／get。
 * 赤の 確かめ: 1D の 前は `mine.findCave` が なく「窓口が ない」で 落ちる。手元では 回さない〔CI で 見る〕。
 */
test.describe.configure({ timeout: 240_000 });

const ACHIEVEMENT = 'はじめて ほたるの ほらあな を みつけた！';

interface Pt {
  x: number;
  y: number;
  z: number;
}

test('D11: ほたるの ほらあなを さがして 床に 置く → caveAt が hotaru・実績・床には 妖怪が 出ない', async ({ page }) => {
  await openStream(page, '?nosave=1');
  const have = await page.evaluate(() => ['findCave', 'caveAt', 'caves'].filter((n) => typeof (window as any).__rikkun?.mine?.[n] === 'function'));
  expect(have, '__rikkun.mine の 窓口〔1D〕').toEqual(['findCave', 'caveAt', 'caves']);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.lock.simulate(true);
    h.input.releaseAll();
    h.yokai.clear();
  });

  const cave = await page.evaluate(() => (window as any).__rikkun.mine.findCave('hotaru') as { id: string; kind: string; center: Pt; box: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } } | null);
  expect(cave, 'ほたるの ほらあなが 見つかる').not.toBeNull();
  expect(cave!.kind).toBe('hotaru');

  const rows = await page.evaluate((name) => (window as any).__rikkun.achievements.list().filter((a: any) => a.name === name).map((a: any) => a.unlocked as boolean), ACHIEVEMENT);
  expect(rows, `実績「${ACHIEVEMENT}」の 行`).toHaveLength(1);
  expect(rows[0], '最初は まだ').toBe(false);

  // 部屋の まわりの 列を 読みこむ
  await page.evaluate(({ x, z }) => (window as any).__rikkun.world.teleport(x, z), { x: cave!.center.x, z: cave!.center.z });
  await settleWorld(page, true);

  // 部屋の 床〔caveAt が hotaru で、足と 頭が 空気、足の 下が 固い マス〕に 置く
  const put = await page.evaluate((box) => {
    const h = (window as any).__rikkun;
    const types = h.world.blockTypes() as { id: string; solid: boolean }[];
    const solid = new Set(types.filter((t) => t.solid).map((t) => t.id));
    const body = (x: number, y: number, z: number): boolean => {
      const id = h.world.getBlock(x, y, z) as string;
      return !solid.has(id) && id !== 'water';
    };
    const cx = (box.x0 + box.x1) >> 1;
    const cz = (box.z0 + box.z1) >> 1;
    let best: { x: number; y: number; z: number } | null = null;
    let bestD = Infinity;
    for (let x = box.x0; x <= box.x1; x++) {
      for (let z = box.z0; z <= box.z1; z++) {
        for (let y = box.y0; y <= box.y1; y++) {
          if (!body(x, y, z) || !body(x, y + 1, z) || !solid.has(h.world.getBlock(x, y - 1, z) as string)) continue;
          if (h.mine.caveAt(x, y, z) !== 'hotaru') continue;
          const d = Math.hypot(x - cx, z - cz);
          if (d < bestD) {
            bestD = d;
            best = { x, y, z };
          }
        }
      }
    }
    if (!best) return null;
    h.player.set({ position: { x: best.x + 0.5, y: best.y, z: best.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    h.step(20);
    const p = h.player.get().position;
    return { x: p.x, y: p.y, z: p.z, cave: h.mine.caveAt(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z)) as string | null };
  }, cave!.box);
  expect(put, '部屋の 床に 立てる 場所').not.toBeNull();
  expect(put!.cave, '足が 部屋の 中〔caveAt〕').toBe('hotaru');
  await drainRebuilds(page);

  const unlocked = await page.evaluate((name) => (window as any).__rikkun.achievements.list().filter((a: any) => a.name === name).map((a: any) => a.unlocked as boolean), ACHIEVEMENT);
  expect(unlocked, `実績「${ACHIEVEMENT}」`).toEqual([true]);

  // 部屋の 床には 妖怪が 出ない: 自動で 出す〔地下の 間かくの 10 回ぶん〕。出た ステップの うちに 消す
  const spawned = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const interval = h.settings.get('yokaiSpawnIntervalUnder') as number;
    h.settings.set('yokaiAutoSpawn', true);
    h.yokai.clear();
    h.yokai.events();
    let total = 0;
    const onFloor: Pt[] = [];
    for (let i = 0; i < interval * 10; i += 10) {
      h.step(10);
      for (const e of h.yokai.events() as { type: string; position: Pt }[]) {
        if (e.type !== 'spawn') continue;
        total++;
        if (h.mine.caveAt(Math.floor(e.position.x), Math.floor(e.position.y), Math.floor(e.position.z)) === 'hotaru') onFloor.push(e.position);
      }
      h.yokai.clear();
    }
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    return { total, onFloor };
  });
  expect(spawned.onFloor, `部屋の 床に 出た 妖怪〔自動で 出た ${spawned.total} 体の うち〕`).toEqual([]);
});
