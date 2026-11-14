import { expect, test, type Page } from '@playwright/test';
import { aimBlock } from './helpers/houseBuilt';
import { installAimHelpers } from './helpers/aim';
import { goTo, findFlatSpots, nextMorning, openTown, place1P, place2P, timeDay, townCarpenter, townDamage, townInfo, townRepairs, townScaffolds, yawOf, type P3, type Rect3, type TownInfo } from './helpers/town';

/**
 * TOWN-1 区切り 1B-2（docs/design/TOWN-1.md §0・§6.1、TOWN-1-place.md の AC10・AC47・AC51・AC55 と AC29 の 足場の 分）の E2E。実装の 前に 書いた 赤の テスト。
 * 画面・入力・当たりが いる 確認と、遊びの 流れの 通しだけ。数・場所・見た目（【ユニット】【UI 検査】【オーナー確認】）は ここに 入れない。
 * 数・座標は ゲームに 聞く（info・carpenter・scaffolds・repairs・athletic）。進めるのは step の 数。時間（ms）では 合否を 決めない（#255）。
 * 約束（あいまいな 所を この テストで こう 読んだ）:
 *  - こやの 建築士さん ＝ `house.architects()` の 中で `first` でない・はじめの 位置が `town.carpenter().pos`（こや）から 3 マス 以内の 人。
 *  - `house.talk(id)` は 1P だけ（口が そうなって いる）。2P の 話しかけは ユニット（town1b2-unit-list.md）。
 *  - 太鼓は 前から ねらって 左クリック（primary）か 右クリック（secondary）の どちらかで たたける（AC47 に 入力の 名前が ない ため 両方 ためす）。
 *  - `athletic.drum(p)` は `window.__rikkun.athletic.drum`。`town.info().athletic` に log・drum の 位置が ある（TOWN-1.md §6.1）。
 *  - 門の 向き: `facing` ＝ 門の 正面（外へ むかう 向き）。内へ 入るのは その 逆。
 */

const stepN = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const OUT: Record<TownInfo['facing'], { x: number; z: number }> = { n: { x: 0, z: -1 }, e: { x: 1, z: 0 }, s: { x: 0, z: 1 }, w: { x: -1, z: 0 } };

interface Arch {
  id: number | string;
  x: number;
  y: number;
  z: number;
  first: boolean;
}
const architectList = (page: Page): Promise<Arch[]> => page.evaluate(() => (window as any).__rikkun.house.architects());
const menu = (page: Page): Promise<{ open: boolean; buttons: { id: string }[] }> => page.evaluate(() => (window as any).__rikkun.house.menu());

/** こやの 建築士さんの id（こやの 作業台の 前に いる 人） */
async function daikuId(page: Page): Promise<number | string> {
  const home = (await townCarpenter(page)).pos;
  const a = (await architectList(page)).find((q) => !q.first && Math.hypot(q.x - home.x, q.z - home.z) <= 3);
  expect(a, 'こやの 建築士さんが house.architects() に いる（こやの 作業台の 前）').toBeTruthy();
  return a!.id;
}

/** 話しかけて メニューが 開く（うなずき ＋ ふきだし）まで 1 ステップずつ 進める。開いたら true（上限 max ステップ） */
const talkUntilOpen = (page: Page, id: number | string, max = 300): Promise<boolean> =>
  page.evaluate(
    ({ id, max }) => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true);
      h.house.talk(id);
      for (let i = 0; i < max && !h.house.menu().open; i++) h.step(1);
      return h.house.menu().open as boolean;
    },
    { id, max },
  );
const closeMenu = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    if (h.house.menu().open) h.house.press('close');
    h.step(3);
  });

test.describe('TOWN-1 1B-2 こやの 建築士さん（AC10）', () => {
  test.describe.configure({ timeout: 300_000 });

  test('AC10: こわれた 所が ない とき こやの 建築士さんは 3,600 ステップ たっても 動かず、話すと HOUSE-1 と 同じ メニュー。外の さいしょの 人も 今の まま', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    await goTo(page, Math.floor(info.plaza.x), Math.floor(info.plaza.z));
    const id = await daikuId(page);
    const before = await townCarpenter(page);
    expect(before.out, 'こわれた 所が ない ので こやに いる').toBe(false);
    expect(before.sign, 'るすの ふだは 出ない').toBe(false);
    await stepN(page, 3600);
    const after = await townCarpenter(page);
    expect(Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z), '場所が かわらない（向きだけ）').toBeLessThan(0.01);
    expect(after.out).toBe(false);

    // 話すと メニューが 開く。外の さいしょの 建築士さんと 同じ ボタン
    expect(await talkUntilOpen(page, id), 'こやの 建築士さんに 話すと メニューが 開く').toBe(true);
    const daikuButtons = (await menu(page)).buttons.map((b) => b.id);
    await closeMenu(page);
    const outer = (await architectList(page)).find((q) => q.first);
    expect(outer, '外の さいしょの 建築士さんは 今の まま いる').toBeTruthy();
    expect(await talkUntilOpen(page, outer!.id), '外の 建築士さんでも メニューが 開く（HOUSE-1 AC1）').toBe(true);
    expect((await menu(page)).buttons.map((b) => b.id), 'ボタンの ならびは こやの 人と 同じ').toEqual(daikuButtons);
    await closeMenu(page);
  });
});

test.describe('TOWN-1 1B-2 門（AC51）', () => {
  test.describe.configure({ timeout: 300_000 });

  test('AC51: 1P も 2P も 前に 歩く 入力 だけで 門の 外から 内へ 300 ステップ 以内に 通りぬける（頭が つかえない）', async ({ page }) => {
    await openTown(page, { duo: true });
    const info = await townInfo(page);
    const out = OUT[info.facing];
    const inYaw = yawOf(-out.x, -out.z);
    const g = info.gate.pos;
    const gateDepth = 13; // 門の おく（マス。§4.5 の 表。この 数は 仕様の 数）
    const outer = Math.floor(gateDepth / 2); // 門の 正面の ふち（マス。門の まん中から 前へ 6）
    const start = { x: Math.floor(g.x) + out.x * outer, z: Math.floor(g.z) + out.z * outer };
    const park = { x: info.plaza.x + 0.5, y: info.groundY + 1, z: info.plaza.z + 0.5 };
    for (const who of [1, 2] as const) {
      await goTo(page, start.x, start.z);
      const gy = await page.evaluate(([x, z]) => (window as any).__rikkun.world.groundHeight(x, z) as number, [start.x, start.z] as const);
      const pos = { x: start.x + 0.5, y: gy + 1, z: start.z + 0.5 };
      if (who === 1) {
        await place2P(page, park);
        await place1P(page, pos, inYaw);
      } else {
        await place1P(page, park);
        await place2P(page, pos);
      }
      const prof = await page.evaluate(([ox, oz, gx, gz]) => { const w = (window as any).__rikkun.world; const a: string[] = []; for (let k = -2; k <= 14; k++) a.push(`${k}:${w.groundHeight(Math.floor(gx) + ox * k, Math.floor(gz) + oz * k)}`); return a.join(' '); }, [out.x, out.z, g.x, g.z] as const);
      console.log('TOWN1 AC51 地面の 高さ（門の まん中から 外へ k マス）', prof);
      const r = await page.evaluate(
        ({ who, inDir, g }) => {
          const h = (window as any).__rikkun;
          const at = (): { x: number; z: number } => (who === 1 ? h.player.get().position : h.duo.pos(2));
          let steps = 0;
          let progress = -99;
          for (; steps < 300; steps++) {
            const p = at();
            if (who === 1) h.input.press('moveForward');
            else {
              h.duo.aimAt(2, { x: Math.floor(p.x + inDir.x * 3), y: Math.floor(h.duo.pos(2).y), z: Math.floor(p.z + inDir.z * 3) });
              (window as any).__pads[1].axes = [0, -1, 0, 0];
            }
            h.step(1);
            const q = at();
            progress = (q.x - g.x) * inDir.x + (q.z - g.z) * inDir.z;
            if (progress >= 8) break; // 門の おくの はんぶん（6.5）を こえて 内がわへ
          }
          h.input.releaseAll();
          if (who === 2) (window as any).__pads[1].axes = [0, 0, 0, 0];
          return { steps, progress };
        },
        { who, inDir: { x: -out.x, z: -out.z }, g: { x: g.x, z: g.z } },
      );
      expect(r.progress, `${who}P: 門の 内がわへ 通りぬけた（${r.steps} ステップ）`).toBeGreaterThanOrEqual(8);
    }
  });
});

test.describe('TOWN-1 1B-2 アスレチック（AC47）', () => {
  test.describe.configure({ timeout: 300_000 });

  test('AC47: ゆれる 丸太の 上で 240 ステップ 立って いても 落ちない。太鼓を はじめて たたくと その 人の cleared が true（もう 1 人は false の まま）', async ({ page }) => {
    await openTown(page, { duo: true });
    await installAimHelpers(page);
    const info = (await townInfo(page)) as TownInfo & { athletic: { log: P3; drum: P3 } };
    expect(info.athletic, 'town.info().athletic（TOWN-1.md §6.1）が まだ ない').toBeTruthy();
    const drumOf = (p: 1 | 2): Promise<{ cleared: boolean }> =>
      page.evaluate((p) => {
        const a = (window as any).__rikkun.athletic;
        if (typeof a?.drum !== 'function') return { cleared: null as unknown as boolean };
        return a.drum(p);
      }, p);
    expect((await drumOf(1)).cleared, 'window.__rikkun.athletic.drum（TOWN-1.md §6.1）が ある。はじめは false').toBe(false);

    // ゆれる 丸太: 上に 立って 何も しない
    const log = info.athletic.log;
    await goTo(page, Math.floor(log.x), Math.floor(log.z));
    await place1P(page, { x: log.x + 0.5, y: log.y + 3, z: log.z + 0.5 }, 0);
    await stepN(page, 40);
    const rest = await page.evaluate(() => (window as any).__rikkun.player.get().position.y as number);
    await stepN(page, 240);
    const y = await page.evaluate(() => (window as any).__rikkun.player.get().position.y as number);
    expect(y, `丸太の 上に 立ったまま（rest ${rest}・240 ステップ後 ${y}）`).toBeGreaterThan(rest - 0.5);

    // 太鼓: 前から ねらって たたく
    const drum = info.athletic.drum;
    await goTo(page, Math.floor(drum.x), Math.floor(drum.z));
    const dirs: { dx: number; dz: number }[] = [{ dx: 0, dz: 2 }, { dx: 0, dz: -2 }, { dx: 2, dz: 0 }, { dx: -2, dz: 0 }];
    let aimed = false;
    for (const d of dirs) {
      const dxs = Math.sign(d.dx);
      const dzs = Math.sign(d.dz);
      await place1P(page, { x: drum.x + 0.5 + d.dx, y: drum.y, z: drum.z + 0.5 + d.dz }, yawOf(-dxs, -dzs));
      const t = await aimBlock(page, { x: Math.floor(drum.x), y: Math.floor(drum.y), z: Math.floor(drum.z) }, 0.5);
      if (t && t.block.x === Math.floor(drum.x) && t.block.y === Math.floor(drum.y) && t.block.z === Math.floor(drum.z)) {
        aimed = true;
        break;
      }
    }
    expect(aimed, '太鼓を ねらえる 立ち場所が ある').toBe(true);
    for (const btn of ['primary', 'secondary'] as const) {
      await page.evaluate((b) => {
        const h = (window as any).__rikkun;
        h.input.release(b);
        h.input.press(b);
        h.step(2);
        h.input.release(b);
        h.step(10);
      }, btn);
      if ((await drumOf(1)).cleared) break;
    }
    expect((await drumOf(1)).cleared, '1P が たたいた ので 1P の cleared').toBe(true);
    expect((await drumOf(2)).cleared, '1P が たたいても 2P の cleared は false の まま').toBe(false);
  });
});

/** まとまりの 四角（マスの 座標。max を ふくむ）と 点の きょり（マス。四角は max ＋1 まで ある ものと 見る） */
const distToRect = (p: { x: number; z: number }, r: Rect3): number => {
  const dx = Math.max(r.min.x - p.x, 0, p.x - (r.max.x + 1));
  const dz = Math.max(r.min.z - p.z, 0, p.z - (r.max.z + 1));
  return Math.hypot(dx, dz);
};
const contains = (outer: Rect3, inner: Rect3): boolean => outer.min.x <= inner.min.x && outer.min.z <= inner.min.z && outer.max.x >= inner.max.x && outer.max.z >= inner.max.z;

interface Row {
  out: boolean;
  state: string;
  sign: boolean;
  target: number | null;
  x: number;
  z: number;
  lefts: number[];
  groups: number;
  scaf: number;
}
interface Probe {
  kind: 'daiku' | 'first';
  open: boolean | null;
}

/** 朝から こやに 帰る まで（out が 一度 true に なって から home）を 1 ステップずつ 進めて 記録する。出て いる 間に こやの 人・外の 人へ 話す */
function runCarpenter(page: Page, ids: { daiku: number | string | null; first: number | string | null }, max = 20000): Promise<{ rows: Row[]; probes: Probe[] }> {
  return page.evaluate(
    ({ ids, max }) => {
      const h = (window as any).__rikkun;
      const rows: Row[] = [];
      const probes: Probe[] = [];
      const rec = () => {
        const c = h.town.carpenter();
        const g = h.town.repairs().groups as { left: number }[];
        rows.push({ out: c.out, state: c.state, sign: c.sign, target: c.target, x: c.pos.x, z: c.pos.z, lefts: g.map((q) => q.left), groups: g.length, scaf: h.town.scaffolds().length });
        return c;
      };
      let seenOut = false;
      let probeStage = 0;
      let outRows = 0;
      for (let i = 0; i < max; i++) {
        h.step(1);
        const c = rec();
        if (c.out) {
          seenOut = true;
          outRows++;
        }
        if (c.out && probeStage === 0 && c.state === 'walk' && ids.daiku !== null) {
          probeStage = 1;
          h.lock.simulate(true);
          h.house.talk(ids.daiku);
          for (let k = 0; k < 6; k++) {
            h.step(1);
            rec();
          }
          probes.push({ kind: 'daiku', open: h.house.menu().open });
          if (h.house.menu().open) h.house.press('close');
        }
        if (c.out && probeStage === 1 && outRows > 80 && ids.first !== null) {
          probeStage = 2;
          h.house.talk(ids.first);
          for (let k = 0; k < 300 && !h.house.menu().open; k++) {
            h.step(1);
            rec();
          }
          probes.push({ kind: 'first', open: h.house.menu().open });
          if (h.house.menu().open) h.house.press('close');
          h.step(3);
          rec();
        }
        if (seenOut && !c.out && c.state === 'home') break;
      }
      return { rows, probes };
    },
    { ids, max },
  );
}

test.describe('TOWN-1 1B-2 こやの 建築士さんの なおし（AC55）', () => {
  test.describe.configure({ timeout: 600_000 });

  test('AC55 通し: こやから 歩いて 近い まとまりから 回り、るす の 間は こやの メニューが 開かず、帰ったら 開く。足場は まとまりごとに 1 つ・ぜんぶ もどって 120 ステップ 以内に きえる', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    const gy = info.groundY;
    const spots = await findFlatSpots(page, info, 3, 3);
    const mk = (s: { x0: number; z0: number }): P3[] => {
      const c: P3[] = [];
      for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) for (const y of [gy, gy - 1]) c.push({ x: s.x0 + dx, y, z: s.z0 + dz });
      return c;
    };
    const cellsA = mk(spots[0]!);
    const cellsB = mk(spots[1]!);
    const park = spots[2]!; // 1P は まとまりから はなれた 所（人が そばに いると まつ）

    // (a) 朝の 前: 足場 なし・るす なし・人の 数は こわれる 前と 同じ
    await goTo(page, Math.floor(info.plaza.x), Math.floor(info.plaza.z));
    // メニューの 分は 下の (c)(d) の テスト（こやの 人が house.architects() に ならぶ つなぎが なくても 歩く 分は 確かめられる ように 分けた）
    const ids = { daiku: null, first: null };
    const home = (await townCarpenter(page)).pos;
    expect((await townScaffolds(page)).length, 'こわれる 前: 足場 なし').toBe(0);
    expect((await townCarpenter(page)).out, 'こわれる 前: こやに いる').toBe(false);
    const npcsBefore = (info as unknown as { npcs: unknown[] }).npcs.length;
    const snapshot = async (cells: P3[]): Promise<string[]> => page.evaluate((cells) => cells.map((c) => (window as any).__rikkun.world.getBlock(c.x, c.y, c.z) as string), cells);
    const beforeA = await snapshot(cellsA);
    const beforeB = await snapshot(cellsB);
    const d = await timeDay(page);
    await goTo(page, spots[0]!.x0 + 1, spots[0]!.z0 + 1);
    expect(await townDamage(page, cellsA, 'air'), 'まとまり A を こわした').toBe(cellsA.length);
    await goTo(page, spots[1]!.x0 + 1, spots[1]!.z0 + 1);
    expect(await townDamage(page, cellsB, 'air'), 'まとまり B を こわした').toBe(cellsB.length);
    await goTo(page, park.x0 + 1, park.z0 + 1);
    const parkPos = { x: park.x0 + 1.5, y: gy + 1, z: park.z0 + 1.5 };
    await place1P(page, parkPos, 0);
    expect((await townInfo(page) as unknown as { npcs: unknown[] }).npcs.length, '人の 数は こわれる 前と 同じ（べつの だいくさんは ふえない）').toBe(npcsBefore);
    const groups0 = (await townRepairs(page)).groups;
    expect(groups0.length, 'まとまりは 2 つ').toBe(2);
    expect((await townCarpenter(page)).out, 'こわれた その 日の うちは こやに いる').toBe(false);

    // 近い まとまりが A・遠い まとまりが B（こやから）
    const rect = (g: { min: P3; max: P3 }): Rect3 => ({ min: { ...g.min }, max: { ...g.max } });
    const idx = [0, 1].sort((a, b) => distToRect(home, rect(groups0[a]!)) - distToRect(home, rect(groups0[b]!)));
    const iA = idx[0]!;
    const iB = idx[1]!;
    const nA = groups0[iA]!.left;
    const nB = groups0[iB]!.left;
    expect(distToRect(home, rect(groups0[iA]!)), 'A は B より こやに 近い').toBeLessThan(distToRect(home, rect(groups0[iB]!)));

    // d＋1 の 朝: 60 ステップ 以内に 出る（足場が 出ても 街の チャンクは 作りなおさない）
    await page.evaluate(() => (window as any).__rikkun.world.rebuildLog(true));
    expect(await nextMorning(page, 0), 'd＋1 の 朝').toBe(d + 1);
    let outAt = -1;
    for (let i = 0; i < 60; i++) {
      await stepN(page, 1);
      const c = await townCarpenter(page);
      if (c.out) {
        outAt = i + 1;
        expect(c.sign, 'るすの ふだが 出る').toBe(true);
        break;
      }
    }
    expect(outAt, '朝の 60 ステップ 以内に こやを 出る').toBeGreaterThan(0);
    const scaf = await townScaffolds(page);
    expect(scaf.length, '足場は まとまりごとに 1 つ').toBe(2);
    for (const g of (await townRepairs(page)).groups) {
      const r = rect(g);
      // 足場の 四角は まとまりの 四角 そのもの か ＋1 の どちらでも よい（わく・柱は すぐ 外がわ）。まとまりを ふくむ ことを 見る
      expect(scaf.some((s) => contains(s, r)), `まとまりの 四角を かこむ 足場が ある ${JSON.stringify(r)}`).toBe(true);
    }
    expect(await page.evaluate(() => (window as any).__rikkun.world.rebuildLog(true).length as number), '足場が 出ても 街の チャンクの 作りなおしは 0 回').toBe(0);

    // (b)(c) 歩いて 回る。出て いる 間は こやの メニューが 開かない・外の 人は 開く
    const t1 = await runCarpenter(page, ids);
    const rows = t1.rows;
    expect(rows.every((r) => r.groups === 2), 'd＋1 の 間 まとまりは 2 つの まま').toBe(true);
    for (let i = 1; i < rows.length; i++) {
      const jump = Math.max(Math.abs(rows[i]!.x - rows[i - 1]!.x), Math.abs(rows[i]!.z - rows[i - 1]!.z));
      expect(jump, `${i} ステップめ: ワープ しない（横 0.1 マス 以内）`).toBeLessThanOrEqual(0.1);
    }
    const fixIdx = rows.findIndex((r) => r.state === 'fix');
    expect(fixIdx, 'たたく（fix）に なった').toBeGreaterThan(0);
    expect(rows[fixIdx]!.target, 'さいしょに たたく のは こやに 近い A').toBe(iA);
    expect(distToRect({ x: rows[fixIdx]!.x, z: rows[fixIdx]!.z }, rect(groups0[iA]!)), 'A の 四角から 3 マス 以内').toBeLessThanOrEqual(3);
    const goalA = nA - Math.ceil(nA / 2);
    const goalB = nB - Math.ceil(nB / 2);
    for (const r of rows) if (r.lefts[iA]! > goalA) expect(r.lefts[iB], 'A の 分が おわる まで B は 1 こも もどらない').toBe(nB);
    const last = rows[rows.length - 1]!;
    expect(last.lefts[iA], 'A は その 朝の 分（半分）が もどった').toBe(goalA);
    expect(last.lefts[iB], 'B も その 朝の 分が もどった').toBe(goalB);
    expect(last.out || last.sign, 'こやに 帰ったら るすが おわり、ふだが きえる').toBe(false);
    expect(rows.slice(0, -1).some((r) => r.out && r.sign), '出て いる 間は ふだが 出て いる').toBe(true);
    expect(rows.filter((r) => r.out).every((r) => r.sign), '出て いる ステップは ぜんぶ ふだが 出て いる').toBe(true);
    const home1 = await townCarpenter(page);
    expect(home1.state, 'こやに 帰って いる').toBe('home');
    expect(Math.hypot(home1.pos.x - home.x, home1.pos.z - home.z), '作業台の 前に もどった').toBeLessThan(1);

    // (g) 足場は ぶつからない: 足場の 柱の 線を 歩いて 通りぬける
    const rA = rect(groups0[iA]!);
    const sA = (await townScaffolds(page)).find((s) => contains(s, rA));
    expect(sA, 'まだ のこって いる 足場（d＋1 の ひる）').toBeTruthy();
    const lineZ = rA.min.z - 1; // 四角の すぐ 外がわ ＝ 足場の 柱の 線
    const x0 = rA.min.x - 4;
    const x1 = rA.max.x + 5;
    await goTo(page, x0, lineZ);
    const gyL = await page.evaluate(([x, z]) => (window as any).__rikkun.world.groundHeight(x, z) as number, [x0, lineZ] as const);
    await place1P(page, { x: x0 + 0.5, y: gyL + 1, z: lineZ + 0.5 }, 90);
    const reach = await page.evaluate((x1) => {
      const h = (window as any).__rikkun;
      h.input.press('moveForward');
      let x = h.player.get().position.x as number;
      for (let i = 0; i < 300 && x < x1; i++) {
        h.step(1);
        x = h.player.get().position.x as number;
      }
      h.input.releaseAll();
      return x;
    }, x1);
    expect(reach, '足場の 柱の 線を 歩いて 通りぬけられた').toBeGreaterThanOrEqual(x1);

    // 足場が 出て いる d＋1 の ひる の 描画回数（あとで 足場が きえた 同じ 景色と くらべる）
    await goTo(page, parkPos.x, parkPos.z);
    const toA = yawOf(rA.min.x - parkPos.x, rA.min.z - parkPos.z);
    await place1P(page, parkPos, toA);
    await stepN(page, 40);
    const dcOn = await page.evaluate(() => (window as any).__rikkun.renderStats().drawCalls as number);

    // d＋2 の 朝: のこりを もどし、ぜんぶ もどったら 足場が 120 ステップ 以内に きえる
    expect(await nextMorning(page, 0), 'd＋2 の 朝').toBe(d + 2);
    const t2 = await runCarpenter(page, ids);
    const rows2 = t2.rows;
    const doneIdx = rows2.findIndex((r) => r.groups === 0 || r.lefts.every((l) => l === 0));
    expect(doneIdx, 'ぜんぶ もどった').toBeGreaterThanOrEqual(0);
    let goneAt = -1;
    for (let i = doneIdx; i < rows2.length; i++) {
      if (rows2[i]!.scaf === 0) {
        goneAt = i;
        break;
      }
    }
    if (goneAt < 0) {
      for (let i = 0; i < 120 && (await townScaffolds(page)).length > 0; i++) await stepN(page, 1);
      goneAt = (await townScaffolds(page)).length === 0 ? rows2.length : -1;
    }
    expect(goneAt, '足場が きえた').toBeGreaterThanOrEqual(0);
    expect(goneAt - doneIdx, 'ぜんぶ もどって から 120 ステップ 以内に 足場が きえる').toBeLessThanOrEqual(120);
    expect((await townScaffolds(page)).length, '足場は 0').toBe(0);
    expect((await townRepairs(page)).cells.length, '記録は 0').toBe(0);
    expect(await snapshot(cellsA), 'A は こわす 前と 同じ').toEqual(beforeA);
    expect(await snapshot(cellsB), 'B は こわす 前と 同じ').toEqual(beforeB);
    const end = await townCarpenter(page);
    expect(end.out || end.sign, 'こやに もどり ふだは ない').toBe(false);

    // 足場が 出て いない 同じ 景色（くらべる 相手）
    await place1P(page, parkPos, toA);
    await stepN(page, 40);
    const dcOff = await page.evaluate(() => (window as any).__rikkun.renderStats().drawCalls as number);
    console.log('TOWN1 AC55 scaffold draw', JSON.stringify({ dcOn, dcOff, diff: dcOn - dcOff }));
    expect(dcOn - dcOff, '足場が 出て いる 間の 描画回数の ふえは ＋2 以下').toBeLessThanOrEqual(2);
  });

  test('AC55 (c)(d): るすの 間は こやの 建築士さんに 話しても メニューが 開かず（外の 人は 開く）、帰ったら 開く', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    const gy = info.groundY;
    const [s] = await findFlatSpots(page, info, 3, 1);
    await goTo(page, Math.floor(info.plaza.x), Math.floor(info.plaza.z));
    const ids = { daiku: await daikuId(page), first: ((await architectList(page)).find((q) => q.first) ?? { id: null }).id as number | string | null };
    expect(ids.first, '外の さいしょの 建築士さんが いる').not.toBeNull();
    await goTo(page, s!.x0 + 1, s!.z0 + 1);
    const cells: P3[] = [];
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) cells.push({ x: s!.x0 + dx, y: gy, z: s!.z0 + dz });
    expect(await townDamage(page, cells, 'air')).toBe(cells.length);
    await goTo(page, Math.floor(info.plaza.x), Math.floor(info.plaza.z));
    await nextMorning(page, 0);
    const t = await runCarpenter(page, ids);
    const probe = (k: Probe['kind']): Probe | undefined => t.probes.find((p) => p.kind === k);
    expect(t.rows.some((r) => r.out), 'こやを 出た').toBe(true);
    expect(probe('daiku')?.open, 'るすの 間に こやの 建築士さんへ 話しても メニューは 開かない').toBe(false);
    expect(probe('first')?.open, 'その 間も 外の さいしょの 建築士さんは メニューが 開く').toBe(true);
    expect((await townCarpenter(page)).out, '帰って いる').toBe(false);
    expect(await talkUntilOpen(page, ids.daiku), '帰った あとは こやの メニューが 開く').toBe(true);
    await closeMenu(page);
  });

  test('AC55 (e): 朝に こやの メニューを 開いて いる 間は 出かけず、とじて 60 ステップ 以内に 出る', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    const gy = info.groundY;
    const [s] = await findFlatSpots(page, info, 3, 1);
    await goTo(page, Math.floor(info.plaza.x), Math.floor(info.plaza.z));
    const id = await daikuId(page);
    await goTo(page, s!.x0 + 1, s!.z0 + 1);
    const cells: P3[] = [];
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) cells.push({ x: s!.x0 + dx, y: gy, z: s!.z0 + dz });
    expect(await townDamage(page, cells, 'air')).toBe(cells.length);
    expect(await talkUntilOpen(page, id), 'こやの メニューを 開く').toBe(true);
    await nextMorning(page, 0);
    for (let i = 0; i < 240; i++) {
      await stepN(page, 1);
      expect((await townCarpenter(page)).out, `メニューを 開いて いる 間は 出かけない（${i + 1}）`).toBe(false);
    }
    await closeMenu(page);
    let went = false;
    for (let i = 0; i < 60 && !went; i++) {
      await stepN(page, 1);
      went = (await townCarpenter(page)).out;
    }
    expect(went, 'とじて 60 ステップ 以内に 出かける').toBe(true);
  });
});
