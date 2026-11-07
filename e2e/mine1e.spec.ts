import { expect, test, type Page } from '@playwright/test';
import { aimAtBlock, installAimHelpers } from './helpers/aim';
import { drainRebuilds, openStream, settleWorld } from './helpers/stream';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.5・§4.12・受け入れ基準 E18）: 通し 1 本。
 *
 *   E18: 新しい 世界 → `mine.shafts` から `hibi_oo` か `hibi_naka` の 行きどまりの ある 1E の 坑道を さがす〔`hibi_oo` が あれば そちら〕→
 *        その 行きどまりの 前に 置く → 前を 向いて 左クリックを おしつづけて ひびの いしを ぜんぶ ほる →
 *        W〔moveForward〕で 歩いて かくしべやに 入る → 実績「はじめて かくしべや を みつけた！」・`caveAt` が 'kodo'。
 *        `hibi_oo` なら 宝箱を あけて 持ち物が `chestPreview` の とおり ふえる。`hibi_naka` なら 見える 鉱石が 表〔`deadEndTable()`〕の 数 以上。
 *   スタートの 見え方の 描画回数〔決定 13 の 上限。E15・E19〕は 今の texA AC12・AC11 の E2E が そのまま 見る〔上限は かえない〕。
 *
 * ほる 長さ〔90 ステップ ＝ 1.5 秒〕・歩く 長さは 仕様の とおりの ステップ数。時間〔ms〕では 合否を 決めない。座標・向き・個数は ゲームの 窓口に 聞く。
 * 窓口〔仕様 §6.1〕: mine.shafts／deadEndTable／chestPreview／chestAt／caveAt、world.spawn／teleport／getBlock／blockTypes、player.set／get、
 *   dig.get〔ready〕、target.get、input.press／release、inventory.get／clear、achievements.list／mute／flush。
 * 実績は openStream が mute するので、足が かくしべやに 入る 前に `achievements.mute(false)` で 解除して、見たら また mute する。
 * 赤の 確かめ: 1E の 前は 1E の 坑道〔`gen: 'e'`〕が なく「ひびの 行きどまりの ある 1E の 坑道が ある」で 落ちる。手元では 回さない〔CI で 見る〕。
 */
test.describe.configure({ timeout: 480_000 });

const ACHIEVEMENT = 'はじめて かくしべや を みつけた！';

interface Pt {
  x: number;
  y: number;
  z: number;
}
interface Found {
  id: string;
  depth: string;
  entrance: Pt;
  end: {
    kind: 'hibi_oo' | 'hibi_naka';
    at: Pt;
    hibi: Pt[];
    room: { x0: number; y: number; z0: number; x1: number; z1: number } | null;
    chest: { x: number; y: number; z: number; cells: Pt[]; front: string } | null;
  };
}

async function needMine(page: Page, names: string[]): Promise<void> {
  const have = await page.evaluate((names) => names.filter((n) => typeof (window as any).__rikkun?.mine?.[n] === 'function'), names);
  expect(have, '__rikkun.mine の 窓口〔1E〕').toEqual(names);
}

test('E18: ひびの 行きどまりの ひびの いしを ぜんぶ ほる → 歩いて かくしべやに 入る → 実績・caveAt・宝箱／鉱石', async ({ page }) => {
  await openStream(page, '?nosave=1');
  await needMine(page, ['shafts', 'deadEndTable', 'chestPreview', 'chestAt', 'caveAt']);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.lock.simulate(true);
    h.input.releaseAll();
    h.yokai.clear();
    h.inventory.clear();
  });

  // --- ひびの 行きどまりの ある 1E の 坑道を さがす〔スタートに 近い 順。hibi_oo を 先に〕 ---
  const found = await page.evaluate((): Found | null => {
    const h = (window as any).__rikkun;
    const sp = h.world.spawn();
    for (const half of [1536, 3072]) {
      const list = (h.mine.shafts(sp.x - half, sp.z - half, sp.x + half - 1, sp.z + half - 1) as any[])
        .filter((s) => s.gen === 'e' && s.style)
        .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z));
      for (const kind of ['hibi_oo', 'hibi_naka']) {
        for (const s of list) {
          const b = (s.branches as any[]).find((e) => e.end.kind === kind);
          if (!b) continue;
          const e = b.end;
          return { id: s.id, depth: s.style.depth, entrance: s.entrance, end: { kind: kind as Found['end']['kind'], at: e.at, hibi: e.hibi, room: e.room, chest: e.chest } };
        }
      }
    }
    return null;
  });
  expect(found, 'ひびの 行きどまりの ある 1E の 坑道が ある').not.toBeNull();
  const f = found!;
  expect(f.end.hibi.length, 'ひびの いしの マス').toBeGreaterThanOrEqual(4);
  expect(f.end.room, 'かくしべや').not.toBeNull();

  // --- 行きどまりの 前に 置く〔つきあたりの 手前の 足の マス。ひびの いしの ほうを 向く〕 ---
  await page.evaluate(({ x, z }) => (window as any).__rikkun.world.teleport(x, z), { x: f.end.at.x, z: f.end.at.z });
  await settleWorld(page, true);
  const first = [...f.end.hibi].sort((a, b) => Math.hypot(a.x - f.end.at.x, a.z - f.end.at.z) - Math.hypot(b.x - f.end.at.x, b.z - f.end.at.z))[0]!;
  const dir = { x: Math.sign(first.x - f.end.at.x), z: Math.sign(first.z - f.end.at.z) };
  expect(Math.abs(dir.x) + Math.abs(dir.z), 'ひびは 行きどまりの 前に まっすぐ').toBe(1);
  const yaw = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
  const stand = async (): Promise<void> => {
    await page.evaluate(({ at, yaw }) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: at.x + 0.5, y: at.y, z: at.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
      h.step(10);
    }, { at: f.end.at, yaw });
  };
  await stand();
  await drainRebuilds(page);
  const hibiBefore = await page.evaluate((cells) => cells.filter((p) => (window as any).__rikkun.world.getBlock(p.x, p.y, p.z) === 'hibi_ishi').length, f.end.hibi);
  expect(hibiBefore, 'ほる 前は ひびの いしが ぜんぶ ある').toBe(f.end.hibi.length);

  // --- 前を 向いて 左クリックを おしつづけて ぜんぶ ほる〔手前から。ひびが MAX〔ready〕に なるまで 長おし → はなして もう 1 回 おすと こわれる〕 ---
  const ordered = [...f.end.hibi].sort((a, b) => Math.hypot(a.x - f.end.at.x, a.z - f.end.at.z) - Math.hypot(b.x - f.end.at.x, b.z - f.end.at.z) || b.y - a.y);
  for (const p of ordered) {
    await aimAtBlock(page, p.x, p.y, p.z, 0.5);
    const r = await page.evaluate((p) => {
      const h = (window as any).__rikkun;
      const t = h.target.get();
      const aimed = t ? (t.block as Pt) : null;
      let readyAt = -1;
      h.input.press('primary');
      for (let i = 1; i <= 400; i++) {
        h.step(1);
        if (h.dig.get().ready) {
          readyAt = i;
          break;
        }
      }
      h.input.release('primary');
      h.step(2);
      h.input.press('primary');
      for (let i = 1; i <= 30 && h.world.getBlock(p.x, p.y, p.z) !== 'air'; i++) h.step(1);
      h.input.release('primary');
      h.step(30);
      return { aimed, readyAt, after: h.world.getBlock(p.x, p.y, p.z) as string };
    }, p);
    expect(r.aimed, `ねらいが ひびの いし (${p.x}, ${p.y}, ${p.z}) に 乗った`).toEqual(p);
    expect(r.readyAt, `ひびの いし (${p.x}, ${p.y}, ${p.z}) は 90 ステップ前後で ほれる`).toBeGreaterThan(0);
    expect(r.readyAt, 'すでで 1.5 秒〔90 ステップ〕前後').toBeLessThanOrEqual(120);
    expect(r.after, `(${p.x}, ${p.y}, ${p.z}) が 消えた`).toBe('air');
  }
  const left = await page.evaluate((cells) => cells.filter((p) => (window as any).__rikkun.world.getBlock(p.x, p.y, p.z) !== 'air').length, f.end.hibi);
  expect(left, 'ひびの いしが ぜんぶ 消えた').toBe(0);

  // --- W で 歩いて かくしべやに 入る〔実績を 数える ために mute を はずす〕 ---
  const rows = await page.evaluate((name) => (window as any).__rikkun.achievements.list().filter((a: any) => a.name === name).map((a: any) => a.unlocked as boolean), ACHIEVEMENT);
  expect(rows, `実績「${ACHIEVEMENT}」の 行`).toHaveLength(1);
  expect(rows[0], '最初は まだ').toBe(false);
  await page.evaluate(() => (window as any).__rikkun.achievements.mute(false));
  await stand();
  const room = f.end.room!;
  const walked = await page.evaluate(({ room, yaw }) => {
    const h = (window as any).__rikkun;
    h.player.set({ yaw, pitch: 0 });
    h.input.press('moveForward');
    let steps = 0;
    let inRoom = false;
    for (; steps < 600 && !inRoom; steps += 10) {
      h.step(10);
      const p = h.player.get().position;
      inRoom = p.x >= room.x0 && p.x < room.x1 + 1 && p.z >= room.z0 && p.z < room.z1 + 1 && Math.abs(p.y - room.y) < 1.5;
    }
    h.input.release('moveForward');
    h.step(10);
    const p = h.player.get().position;
    const cell = { x: Math.floor(p.x), y: Math.floor(p.y + 0.1), z: Math.floor(p.z) };
    return { inRoom, steps, cell, cave: h.mine.caveAt(cell.x, cell.y, cell.z) as string | null };
  }, { room, yaw });
  expect(walked.inRoom, `W で かくしべやに 入れた〔${walked.steps} ステップ〕`).toBe(true);
  expect(walked.cave, `足が 坑道の 中〔(${walked.cell.x}, ${walked.cell.y}, ${walked.cell.z})〕`).toBe('kodo');
  await drainRebuilds(page);
  const unlocked = await page.evaluate((name) => (window as any).__rikkun.achievements.list().filter((a: any) => a.name === name).map((a: any) => a.unlocked as boolean), ACHIEVEMENT);
  expect(unlocked, `実績「${ACHIEVEMENT}」`).toEqual([true]);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.flush();
    h.achievements.mute(true);
  });

  if (f.end.kind === 'hibi_oo') {
    // --- hibi_oo: 宝箱を あけて 持ち物が プレビューの とおり ふえる ---
    const chest = f.end.chest;
    expect(chest, 'hibi_oo の かくしべやには 宝箱').not.toBeNull();
    const main = { x: chest!.x, y: chest!.y, z: chest!.z };
    const rest = chest!.cells.find((c) => c.x !== main.x || c.y !== main.y || c.z !== main.z)!;
    const preview = await page.evaluate((m) => (window as any).__rikkun.mine.chestPreview(m.x, m.y, m.z) as { tier: number; items: { item: string; count: number }[] } | null, main);
    expect(preview, 'プレビュー').not.toBeNull();
    expect(preview!.items.length, '中身').toBeGreaterThan(0);
    await aimAtBlock(page, rest.x, rest.y, rest.z, 0.5);
    const aimed = await page.evaluate(() => {
      const t = (window as any).__rikkun.target.get();
      return t ? (t.block as Pt) : null;
    });
    expect(aimed, 'ねらいが 宝箱に 乗った').toEqual(rest);
    // ひびの いしを ほった とき 持ち物に 入った 物〔いし など〕を 引くため、あける 直前の 持ち物を とっておく
    const bagNow = () =>
      page.evaluate(() => {
        const out: Record<string, number> = {};
        for (const s of (window as any).__rikkun.inventory.get().slots as ({ item: string; count: number } | null)[]) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
        return out;
      });
    const before = await bagNow();
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.input.press('secondary');
      h.step(2);
      h.input.release('secondary');
      h.step(60); // ふたが 動いて 持ち物に 入る まで
    });
    const bag = await bagNow();
    const gained: Record<string, number> = {};
    for (const id of new Set([...Object.keys(bag), ...Object.keys(before)])) {
      const d = (bag[id] ?? 0) - (before[id] ?? 0);
      if (d !== 0) gained[id] = d;
    }
    const want: Record<string, number> = {};
    for (const it of preview!.items) want[it.item] = (want[it.item] ?? 0) + it.count;
    expect(gained, '持ち物が プレビューの とおり ふえる〔あける 前との さ〕').toEqual(want);
  } else {
    // --- hibi_naka: 見える 鉱石が 表の 数 以上 ---
    const need = await page.evaluate((depth) => {
      const t = (window as any).__rikkun.mine.deadEndTable();
      return t.ores[depth].naka as Record<string, number>;
    }, f.depth);
    const seen = await page.evaluate(({ room, need }) => {
      const h = (window as any).__rikkun;
      const out: Record<string, number> = {};
      for (let x = room.x0 - 1; x <= room.x1 + 1; x++) for (let z = room.z0 - 1; z <= room.z1 + 1; z++) for (let y = room.y - 1; y <= room.y + 4; y++) {
        const id = h.world.getBlock(x, y, z) as string;
        if (id in need) out[id] = (out[id] ?? 0) + 1; // 表の きらきらの id を そのまま 数える〔nendo・sekkaiseki も〕
      }
      return out;
    }, { room, need });
    expect(Object.keys(need).length, '表の きらきらの 鉱石').toBeGreaterThan(0);
    for (const [id, n] of Object.entries(need)) expect(seen[id] ?? 0, `見える ${id}`).toBeGreaterThanOrEqual(n);
  }
});
